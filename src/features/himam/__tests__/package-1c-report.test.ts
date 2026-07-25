import { beforeEach, describe, expect, it } from "vitest";
import {
  CaseExtractionService,
  CaseService,
  createInMemoryRepository,
  DefaultDocumentTextExtractor,
  EvidenceService,
  GovernedReportService,
  HumanReviewService,
  IdentityIntegrityService,
  IngestionService,
  InMemoryPlanFileStorage,
  ReviewCoverageService,
  ReviewVersionService,
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
  const report = new GovernedReportService(repo);
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
    report,
  };
}

async function readyCase(h: ReturnType<typeof harness>) {
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
  const chunk = h.repo.load().textChunks.find((x) => x.sourceId === src.id)!;
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

function decideAll(h: ReturnType<typeof harness>, caseId: string, decision: "accept" | "reject" | "defer" = "accept") {
  const findings = h.repo.load().reviewFindings.filter((f) => f.caseId === caseId && !f.isStale);
  for (const f of findings) {
    if (f.humanReviewStatus === "decided") continue;
    h.human.applyDecision({ findingId: f.findingId, decision });
  }
}

describe("HIMAM Package 1C.3 — Governed Report", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("PKG1C-R-T01: gate blocks when no review version exists", async () => {
    const { c } = await readyCase(h);
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("no_review_version");
  });

  it("PKG1C-R-T02: gate blocks when review not completed", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("review_not_completed");
  });

  it("PKG1C-R-T03: gate ok and draft generated with metadata + governance", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(true);
    const v = h.report.generateDraft(c.id);
    expect(v.status).toBe("draft");
    expect(v.versionNumber).toBe(1);
    expect(v.sections.governanceStatement.length).toBeGreaterThan(20);
    expect(v.metadata.caseReferenceCode).toBe(c.referenceCode);
  });

  it("PKG1C-R-T04: judgment sections contain only accept/modify decisions", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    const judged = [
      ...v.sections.actionRequired,
      ...v.sections.majorPlanGaps,
      ...v.sections.qualityImprovements,
      ...v.sections.guidanceNotes,
    ];
    for (const it of judged) {
      expect(["accept", "modify"]).toContain(it.humanDecision);
    }
  });

  it("PKG1C-R-T05: rejected findings appear in excludedFindings, not in body", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    const findings = h.repo.load().reviewFindings.filter((f) => f.caseId === c.id);
    const first = findings[0]!;
    h.human.applyDecision({ findingId: first.findingId, decision: "reject" });
    for (const f of findings.slice(1)) {
      if (f.automatedSeverity === "action_required_before_goal_approval") {
        h.human.applyDecision({ findingId: f.findingId, decision: "accept" });
      }
    }
    for (const f of findings.slice(1)) {
      if (f.humanReviewStatus !== "decided")
        h.human.applyDecision({ findingId: f.findingId, decision: "accept" });
    }
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    expect(v.sections.excludedFindings.find((x) => x.findingId === first.findingId)?.reason).toBe(
      "rejected_by_reviewer",
    );
    const inBody = [
      ...v.sections.actionRequired,
      ...v.sections.majorPlanGaps,
      ...v.sections.qualityImprovements,
      ...v.sections.guidanceNotes,
      ...v.sections.needsClarificationItems,
      ...v.sections.notReviewableItems,
    ].find((x) => x.findingId === first.findingId);
    expect(inBody).toBeUndefined();
  });

  it("PKG1C-R-T06: request_more_information with includeInReport=true → needs clarification", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    const findings = h.repo.load().reviewFindings.filter((f) => f.caseId === c.id);
    const target = findings.find(
      (f) => f.automatedSeverity !== "action_required_before_goal_approval",
    )!;
    h.human.applyDecision({
      findingId: target.findingId,
      decision: "request_more_information",
      includeInReport: true,
    });
    for (const f of findings) {
      if (f.humanReviewStatus !== "decided")
        h.human.applyDecision({ findingId: f.findingId, decision: "accept" });
    }
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    expect(
      v.sections.needsClarificationItems.find((x) => x.findingId === target.findingId),
    ).toBeTruthy();
  });

  it("PKG1C-R-T07: request_more_information with includeInReport=false is hidden from body", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    const findings = h.repo.load().reviewFindings.filter((f) => f.caseId === c.id);
    const target = findings.find(
      (f) => f.automatedSeverity !== "action_required_before_goal_approval",
    )!;
    h.human.applyDecision({
      findingId: target.findingId,
      decision: "request_more_information",
      includeInReport: false,
    });
    for (const f of findings) {
      if (f.humanReviewStatus !== "decided")
        h.human.applyDecision({ findingId: f.findingId, decision: "accept" });
    }
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    const found = [
      ...v.sections.needsClarificationItems,
      ...v.sections.actionRequired,
      ...v.sections.majorPlanGaps,
      ...v.sections.qualityImprovements,
      ...v.sections.guidanceNotes,
      ...v.sections.notReviewableItems,
    ].find((x) => x.findingId === target.findingId);
    expect(found).toBeUndefined();
  });

  it("PKG1C-R-T08: finalized report snapshot is immutable when a new draft is generated", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v1 = h.report.generateDraft(c.id);
    const before = JSON.stringify(v1.sections);
    h.report.finalize(v1.reportVersionId);
    // Rerun engine and re-decide, then generate a new report
    h.versions.runEngine(c.id, "manual_rerun");
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    h.report.generateDraft(c.id);
    const stored = h.report.getById(v1.reportVersionId)!;
    expect(JSON.stringify(stored.sections)).toBe(before);
  });

  it("PKG1C-R-T09: new version increments versionNumber and keeps older ones", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v1 = h.report.generateDraft(c.id);
    h.report.finalize(v1.reportVersionId);
    h.versions.runEngine(c.id, "manual_rerun");
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v2 = h.report.generateDraft(c.id);
    expect(v2.versionNumber).toBe(2);
    const all = h.report.listForCase(c.id);
    expect(all.length).toBe(2);
  });

  it("PKG1C-R-T10: rerunning engine marks finalized report with staleReason but keeps it stored", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v1 = h.report.generateDraft(c.id);
    h.report.finalize(v1.reportVersionId);
    h.versions.runEngine(c.id, "manual_rerun");
    const stored = h.report.getById(v1.reportVersionId)!;
    expect(stored.status).toBe("finalized");
    expect(stored.staleReason).toBeTruthy();
  });

  it("PKG1C-R-T11: item traceability — every item carries evidenceIds and sourceIds", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    const all = [
      ...v.sections.actionRequired,
      ...v.sections.majorPlanGaps,
      ...v.sections.qualityImprovements,
      ...v.sections.guidanceNotes,
      ...v.sections.needsClarificationItems,
      ...v.sections.notReviewableItems,
    ];
    for (const it of all) {
      expect(Array.isArray(it.evidenceIds)).toBe(true);
      expect(Array.isArray(it.sourceIds)).toBe(true);
      expect(it.criterionId).toBeTruthy();
    }
  });

  it("PKG1C-R-T12: coverage snapshot has no quality score keys", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    const keys = Object.keys(v.coverage);
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("qualityScore");
    expect(keys).not.toContain("passRate");
  });

  it("PKG1C-R-T13: report contains a governance statement", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    expect(v.sections.governanceStatement).toMatch(/محرك مراجعة حتمي/);
  });

  it("PKG1C-R-T14: report does not mention AI in governance text", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    expect(v.sections.governanceStatement.toLowerCase()).not.toContain("gpt");
    expect(v.sections.governanceStatement.toLowerCase()).not.toContain("llm");
    expect(v.sections.governanceStatement).toMatch(/لا يُستخدم أي ذكاء اصطناعي/);
  });

  it("PKG1C-R-T15: cannot close case without a finalized recent report", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    expect(() => h.cases.closeCaseAfterFinalReport(c.id)).toThrow();
  });

  it("PKG1C-R-T16: closing after finalized report puts case into read-only", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v1 = h.report.generateDraft(c.id);
    h.report.finalize(v1.reportVersionId);
    const closed = h.cases.closeCaseAfterFinalReport(c.id);
    expect(closed.status).toBe("closed");
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("case_closed_read_only");
  });

  it("PKG1C-R-T17: compareVersions returns added/removed/changed", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v1 = h.report.generateDraft(c.id);
    h.report.finalize(v1.reportVersionId);
    h.versions.runEngine(c.id, "manual_rerun");
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v2 = h.report.generateDraft(c.id);
    const diff = h.report.compareVersions(c.id, v1.reportVersionId, v2.reportVersionId);
    expect(Array.isArray(diff.addedFindings)).toBe(true);
    expect(Array.isArray(diff.removedFindings)).toBe(true);
    expect(Array.isArray(diff.changedFindings)).toBe(true);
  });

  it("PKG1C-R-T18: finalized report is retained even after being marked stale", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    h.report.finalize(v.reportVersionId);
    h.report.markReportsStale(c.id, "test");
    const kept = h.report.getById(v.reportVersionId)!;
    expect(kept.status).toBe("finalized");
    expect(kept.staleReason).toBe("test");
  });

  it("PKG1C-R-T19: gate blocks on identity conflict", async () => {
    const { c, src } = await readyCase(h);
    // Add conflicting identity marker
    const chunk = h.repo.load().textChunks.find((x) => x.sourceId === src.id)!;
    const m1 = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId: chunk.chunkId,
      exactQuote: "أحمد",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(m1.id);
    const s2 = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(s2.id, new Blob(["الطالب سالم."], { type: "text/plain" }));
    await h.ingestion.ingestSource(s2.id);
    const ch2 = h.repo.load().textChunks.find((x) => x.sourceId === s2.id)!;
    const m2 = h.evidence.createManualEvidence({
      sourceId: s2.id,
      chunkId: ch2.chunkId,
      exactQuote: "سالم",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(m2.id);
    h.identity.recompute(c.id);
    if (h.cases.get(c.id)!.scopeNeedsReconfirmation) h.cases.reconfirmScope(c.id);
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("identity_conflict_unresolved");
  });

  it("PKG1C-R-T20: report service does not perform any network call (only reads repo)", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    // Fail if the service module tries to fetch/XHR at import or method time.
    const body = (h.report.generateDraft as unknown as { toString: () => string }).toString();
    expect(body).not.toMatch(/\bfetch\s*\(/);
    expect(body).not.toMatch(/XMLHttpRequest/);
  });

  it("PKG1C-R-T21: cannot finalize a draft when a critical finding was left pending after rerun", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    // Rerun and don't decide anything — finalize should throw
    h.versions.runEngine(c.id, "manual_rerun");
    expect(() => h.report.finalize(v.reportVersionId)).toThrow();
  });

  it("PKG1C-R-T22: draft has no confirmed evidence gap — all finding sourceIds trace to sources", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    const store = h.repo.load();
    const validIds = new Set(store.sources.map((s) => s.id));
    const all = [
      ...v.sections.actionRequired,
      ...v.sections.majorPlanGaps,
      ...v.sections.qualityImprovements,
      ...v.sections.guidanceNotes,
      ...v.sections.needsClarificationItems,
      ...v.sections.notReviewableItems,
    ];
    for (const it of all)
      for (const sid of it.sourceIds) expect(validIds.has(sid)).toBe(true);
  });

  it("PKG1C-R-T23: generating without ok gate throws", async () => {
    const { c } = await readyCase(h);
    expect(() => h.report.generateDraft(c.id)).toThrow();
  });

  it("PKG1C-R-T24: end-to-end closure — draft → finalize → close case → read only", async () => {
    const { c } = await readyCase(h);
    h.versions.runEngine(c.id);
    decideAll(h, c.id, "accept");
    h.versions.completeHumanReview(c.id);
    const v = h.report.generateDraft(c.id);
    h.report.finalize(v.reportVersionId);
    const closed = h.cases.closeCaseAfterFinalReport(c.id);
    expect(closed.status).toBe("closed");
    // A new generation is now blocked
    const gate = h.report.canGenerateGovernedReport(c.id);
    expect(gate.ok).toBe(false);
  });
});