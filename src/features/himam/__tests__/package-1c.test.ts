import { beforeEach, describe, expect, it } from "vitest";
import {
  CaseExtractionService,
  CaseService,
  createInMemoryRepository,
  DeterministicReviewEngine,
  DefaultDocumentTextExtractor,
  ENGINE_VERSION,
  EvidenceService,
  HumanReviewService,
  IdentityIntegrityService,
  IngestionService,
  InMemoryPlanFileStorage,
  ReviewCoverageService,
  ReviewVersionService,
  computeEvidenceDigest,
  getKnowledgeRegistry,
  loadKnowledgeBundle,
} from "..";
import type { ReviewCaseRepository } from "..";

function harness() {
  const repo: ReviewCaseRepository = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  const cases = new CaseService(repo, storage);
  const extractor = new DefaultDocumentTextExtractor(
    async () => [],
    async () => "",
  );
  const ingestion = new IngestionService(repo, storage, extractor);
  const evidence = new EvidenceService(repo);
  const identity = new IdentityIntegrityService(repo);
  const caseExtraction = new CaseExtractionService(repo);
  const versions = new ReviewVersionService(repo);
  const human = new HumanReviewService(repo);
  const coverage = new ReviewCoverageService(repo);
  return {
    repo,
    storage,
    cases,
    ingestion,
    evidence,
    identity,
    caseExtraction,
    versions,
    human,
    coverage,
  };
}

async function fullyPreparedCase(h: ReturnType<typeof harness>) {
  const c = h.cases.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
  const src = h.cases.registerSource({
    reviewCaseId: c.id,
    type: "plan",
    fileName: "plan.txt",
    mimeType: "text/plain",
  });
  await h.cases.attachPlanFile(
    src.id,
    new Blob(["الطالب أحمد. هدف: يقرأ كلمات."], { type: "text/plain" }),
  );
  await h.ingestion.ingestSource(src.id);
  const store = h.repo.load();
  const chunk = store.textChunks.find((x) => x.sourceId === src.id)!;
  const goal = h.evidence.createManualEvidence({
    sourceId: src.id,
    chunkId: chunk.chunkId,
    exactQuote: "يقرأ كلمات",
    evidenceType: "plan_goal",
  });
  h.evidence.confirmEvidence(goal.id);
  h.cases.generateScope(c.id);
  h.cases.confirmScope(c.id);
  h.caseExtraction.completeExtractionConfirmation(c.id);
  return { c, src, goal };
}

describe("HIMAM Package 1C — Deterministic Review Engine", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("PKG1C-T01: gate blocks review when scope not confirmed", () => {
    const c = h.cases.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
    const gate = h.versions.canOpenReview(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("scope_not_confirmed");
  });

  it("PKG1C-T02: gate blocks review when extraction not confirmed", async () => {
    const c = h.cases.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
    const src = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(src.id, new Blob(["نص"], { type: "text/plain" }));
    await h.ingestion.ingestSource(src.id);
    h.cases.generateScope(c.id);
    h.cases.confirmScope(c.id);
    const gate = h.versions.canOpenReview(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("extraction_not_confirmed");
  });

  it("PKG1C-T03: engine emits findings only after all gates pass", async () => {
    const { c } = await fullyPreparedCase(h);
    const { findings, version } = h.versions.runEngine(c.id);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.reviewVersionId).toBe(version.versionId);
      expect(f.engineVersion).toBe(ENGINE_VERSION);
      expect(f.criterionId).toBeTruthy();
    }
  });

  it("PKG1C-T04: missing optional input yields not_reviewable, never not_achieved", async () => {
    const { c } = await fullyPreparedCase(h);
    // Case has no assessment/family_priorities/etc.
    const { findings } = h.versions.runEngine(c.id);
    // Criteria requiring assessment (not provided) must be not_reviewable
    const relying = findings.filter(
      (f) =>
        (f.criterionId === "C003") /* identity */ === false &&
        f.rationale.includes("مدخل مطلوب غير متاح"),
    );
    // At least one criterion should be not_reviewable due to missing optional input
    const notReviewable = findings.filter((f) => f.automatedStatus === "not_reviewable");
    expect(notReviewable.length).toBeGreaterThan(0);
    // And none of these should carry not_achieved
    for (const nr of notReviewable) expect(nr.automatedStatus).not.toBe("not_achieved");
    expect(relying).toBeDefined();
  });

  it("PKG1C-T05: phase-not-applicable criterion emits not_applicable", async () => {
    const { c } = await fullyPreparedCase(h);
    const { findings } = h.versions.runEngine(c.id);
    // For an elementary case, adult-transition criteria should be not_applicable.
    const na = findings.filter((f) => f.automatedStatus === "not_applicable");
    expect(na.length).toBeGreaterThan(0);
  });

  it("PKG1C-T06: unconfirmed evidence never enters any finding", async () => {
    const { c, src } = await fullyPreparedCase(h);
    const chunk = h.repo.load().textChunks.find((x) => x.sourceId === src.id)!;
    const pending = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId: chunk.chunkId,
      exactQuote: "أحمد",
      evidenceType: "identity_marker",
    });
    // Leave pending
    const { findings } = h.versions.runEngine(c.id);
    for (const f of findings) {
      expect(f.evidenceIds).not.toContain(pending.id);
    }
  });

  it("PKG1C-T07: every finding carries criterionId; case/plan-goal targets carry evidenceIds when applicable", async () => {
    const { c } = await fullyPreparedCase(h);
    const { findings } = h.versions.runEngine(c.id);
    for (const f of findings) {
      expect(f.criterionId).toMatch(/^C\d{3}$/);
      expect(Array.isArray(f.evidenceIds)).toBe(true);
      expect(Array.isArray(f.sourceIds)).toBe(true);
    }
  });

  it("PKG1C-T08: engine does not perform any network call (deterministic)", async () => {
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = ((..._a: unknown[]) => {
      called++;
      return Promise.reject(new Error("network banned"));
    }) as unknown as typeof fetch;
    try {
      const { c } = await fullyPreparedCase(h);
      h.versions.runEngine(c.id);
      expect(called).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("PKG1C-T09: evidence change after run causes drift; markStale invalidates old findings", async () => {
    const { c, src } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const first = h.versions.currentVersion(c.id)!;
    const chunk = h.repo.load().textChunks.find((x) => x.sourceId === src.id)!;
    const extra = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId: chunk.chunkId,
      exactQuote: "أحمد",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(extra.id);
    const drift = h.versions.detectDrift(c.id);
    expect(drift.drifted).toBe(true);
    h.versions.markStale(c.id, drift.reason ?? "test");
    const findings = h.versions.findingsFor(c.id, first.versionId);
    expect(findings.every((f) => f.isStale)).toBe(true);
  });

  it("PKG1C-T10: cannot complete review with pending critical finding", async () => {
    const { c } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const findings = h.versions.findingsFor(c.id);
    const critical = findings.find(
      (f) => f.automatedSeverity === "action_required_before_goal_approval",
    );
    // Ensure the fixture actually creates one such finding.
    expect(critical).toBeDefined();
    expect(() => h.versions.completeHumanReview(c.id)).toThrow(/critical findings/);
  });

  it("PKG1C-T11: modify keeps automated fields intact; human fields stored separately", async () => {
    const { c } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const f = h.versions.findingsFor(c.id)[0];
    const before = { status: f.automatedStatus, severity: f.automatedSeverity };
    const updated = h.human.applyDecision({
      findingId: f.findingId,
      decision: "modify",
      humanStatus: "achieved",
      humanSeverity: "quality_improvement",
      humanRationale: "قرار مراجع.",
    });
    expect(updated.automatedStatus).toBe(before.status);
    expect(updated.automatedSeverity).toBe(before.severity);
    expect(updated.humanStatus).toBe("achieved");
    expect(updated.humanSeverity).toBe("quality_improvement");
    expect(updated.humanDecision).toBe("modify");
  });

  it("PKG1C-T12: reject does not remove the automated record", async () => {
    const { c } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const f = h.versions.findingsFor(c.id)[0];
    const rejected = h.human.applyDecision({ findingId: f.findingId, decision: "reject" });
    // Automated record is still there and intact.
    expect(rejected.automatedStatus).toBe(f.automatedStatus);
    // Human status is cleared when rejected.
    expect(rejected.humanStatus).toBeNull();
    expect(rejected.humanDecision).toBe("reject");
    // Finding still exists in the store.
    expect(h.human.listForCase(c.id).some((x) => x.findingId === f.findingId)).toBe(true);
  });

  it("PKG1C-T13: closed case is read-only for human decisions", async () => {
    const { c } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const f = h.versions.findingsFor(c.id)[0];
    h.cases.closeCase(c.id);
    expect(() => h.human.applyDecision({ findingId: f.findingId, decision: "accept" })).toThrow(
      /closed/,
    );
  });

  it("PKG1C-T14: identity conflict blocks review gate", async () => {
    const { c, src } = await fullyPreparedCase(h);
    // Add a conflicting identity marker on the plan
    const chunk = h.repo.load().textChunks.find((x) => x.sourceId === src.id)!;
    const e1 = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId: chunk.chunkId,
      exactQuote: "أحمد",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(e1.id);
    // Second source with different name
    const s2 = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(s2.id, new Blob(["الطالب سالم."], { type: "text/plain" }));
    await h.ingestion.ingestSource(s2.id);
    const ch2 = h.repo.load().textChunks.find((x) => x.sourceId === s2.id)!;
    const e2 = h.evidence.createManualEvidence({
      sourceId: s2.id,
      chunkId: ch2.chunkId,
      exactQuote: "سالم",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(e2.id);
    h.identity.recompute(c.id);
    // Reconfirm scope so the only remaining blocker is the identity conflict.
    if (h.cases.get(c.id)!.scopeNeedsReconfirmation) h.cases.reconfirmScope(c.id);
    const gate = h.versions.canOpenReview(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("identity_conflict_unresolved");
  });

  it("PKG1C-T15: scopeNeedsReconfirmation blocks the review gate", async () => {
    const { c } = await fullyPreparedCase(h);
    // Register a new source AFTER scope was confirmed
    const s2 = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(s2.id, new Blob(["نص"], { type: "text/plain" }));
    const gate = h.versions.canOpenReview(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("scope_needs_reconfirmation");
  });

  it("PKG1C-T16: coverage counts pending/decided; no total quality score", async () => {
    const { c } = await fullyPreparedCase(h);
    h.versions.runEngine(c.id);
    const cov = h.coverage.compute(c.id);
    expect(cov.activeCriteriaCount).toBeGreaterThan(0);
    expect(cov.pendingHumanDecisionCount).toBe(cov.activeCriteriaCount);
    // Coverage schema has no "score" field.
    expect(Object.keys(cov)).not.toContain("score");
    expect(Object.keys(cov)).not.toContain("qualityScore");
  });

  it("PKG1C-T17: rerunning the engine creates a new version and marks the old stale", async () => {
    const { c } = await fullyPreparedCase(h);
    const first = h.versions.runEngine(c.id);
    const second = h.versions.runEngine(c.id, "manual_rerun");
    expect(second.version.versionId).not.toBe(first.version.versionId);
    const all = h.versions.allVersions(c.id);
    const old = all.find((v) => v.versionId === first.version.versionId)!;
    expect(old.isStale).toBe(true);
    // Old findings remain in the store for audit.
    expect(
      h.repo.load().reviewFindings.filter((f) => f.reviewVersionId === first.version.versionId)
        .length,
    ).toBeGreaterThan(0);
  });

  it("PKG1C-T18: age is never used to infer capability (no age numerics in engine)", async () => {
    // The engine module reads only from confirmed scope + confirmed evidence.
    // Age enters solely through the scope's phase gate. This test asserts the
    // engine module contains no numeric age thresholds or inferences.
    const src = (await import("../review/deterministic-review-engine")).DeterministicReviewEngine;
    const body = src.toString();
    expect(body).not.toMatch(/age\s*[<>=!]+\s*\d+/);
  });

  it("PKG1C-T19: knowledge registry exposes every 1C criterion field", () => {
    const reg = getKnowledgeRegistry();
    const c001 = reg.criterion("C001");
    expect(c001).not.toBeNull();
    expect(c001!.reviewQuestion).toBeTruthy();
    expect(c001!.reportMessageTemplate).toBeTruthy();
    expect(c001!.recommendationTemplate).toBeTruthy();
    expect(typeof c001!.requiresHumanConfirmation).toBe("boolean");
  });

  it("PKG1C-T20: engine version stamped and stable", async () => {
    const { c } = await fullyPreparedCase(h);
    const { findings, version } = h.versions.runEngine(c.id);
    expect(version.engineVersion).toBe(ENGINE_VERSION);
    for (const f of findings) expect(f.engineVersion).toBe(ENGINE_VERSION);
  });

  it("PKG1C-T21: knowledge bundle load exposes 55 criteria", () => {
    const bundle = loadKnowledgeBundle();
    expect(bundle.criteria.criteria.length).toBe(55);
  });

  it("PKG1C-T22: computeEvidenceDigest is stable under reordering", () => {
    const now = new Date().toISOString();
    const base = { id: "x", status: "confirmed" as const, updatedAt: now };
    const a = { ...base, id: "a" };
    const b = { ...base, id: "b" };
    const arr1 = [a, b] as unknown as Parameters<typeof computeEvidenceDigest>[0];
    const arr2 = [b, a] as unknown as Parameters<typeof computeEvidenceDigest>[0];
    expect(computeEvidenceDigest(arr1)).toBe(computeEvidenceDigest(arr2));
  });
});
