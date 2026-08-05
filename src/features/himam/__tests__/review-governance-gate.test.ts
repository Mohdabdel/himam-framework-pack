import { beforeEach, describe, expect, it } from "vitest";
import {
  CaseExtractionService,
  CaseService,
  createInMemoryRepository,
  DefaultDocumentTextExtractor,
  EvidenceService,
  GovernedReportService,
  HumanReviewService,
  IngestionService,
  InMemoryPlanFileStorage,
  ReviewCoverageService,
  ReviewVersionService,
  isSystemClassificationStatus,
} from "..";
import type { ReviewCaseRepository } from "..";

function harness() {
  const repo: ReviewCaseRepository = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  return {
    repo,
    storage,
    cases: new CaseService(repo, storage),
    ingestion: new IngestionService(
      repo,
      storage,
      new DefaultDocumentTextExtractor(
        async () => [],
        async () => "",
      ),
    ),
    evidence: new EvidenceService(repo),
    extraction: new CaseExtractionService(repo),
    versions: new ReviewVersionService(repo),
    human: new HumanReviewService(repo),
    coverage: new ReviewCoverageService(repo),
    report: new GovernedReportService(repo),
  };
}

async function preparedCase(h: ReturnType<typeof harness>) {
  const c = h.cases.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
  const source = h.cases.registerSource({
    reviewCaseId: c.id,
    type: "plan",
    fileName: "plan.txt",
    mimeType: "text/plain",
  });
  await h.cases.attachPlanFile(
    source.id,
    new Blob(["الطالب أحمد. هدف: يقرأ كلمات."], { type: "text/plain" }),
  );
  await h.ingestion.ingestSource(source.id);
  const chunk = h.repo.load().textChunks.find((x) => x.sourceId === source.id)!;
  const goal = h.evidence.createManualEvidence({
    sourceId: source.id,
    chunkId: chunk.chunkId,
    exactQuote: "يقرأ كلمات",
    evidenceType: "plan_goal",
  });
  h.evidence.confirmEvidence(goal.id);
  h.cases.generateScope(c.id);
  h.cases.confirmScope(c.id);
  h.extraction.completeExtractionConfirmation(c.id);
  return c;
}

describe("HIMAM review/report resolution governance", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it("blocks completion until every professional result and system classification is resolved", async () => {
    const c = await preparedCase(h);
    const { version, findings } = h.versions.runEngine(c.id);
    const professional = findings.filter((f) => !isSystemClassificationStatus(f.automatedStatus));
    const system = findings.filter((f) => isSystemClassificationStatus(f.automatedStatus));
    expect(professional.length).toBeGreaterThan(0);
    expect(system.length).toBeGreaterThan(0);

    h.human.applyDecisions(
      professional.map((f) => ({ findingId: f.findingId, decision: "accept" as const })),
    );
    expect(() => h.versions.completeHumanReview(c.id)).toThrow(/system classifications/);

    const acknowledged = h.human.acknowledgeSystemClassifications(c.id, version.versionId);
    expect(acknowledged).toHaveLength(system.length);
    expect(h.versions.completeHumanReview(c.id).completedAt).not.toBeNull();

    const coverage = h.coverage.compute(c.id, version.versionId);
    expect(coverage.pendingHumanDecisionCount).toBe(0);
    expect(coverage.systemClassificationPendingCount).toBe(0);
    expect(coverage.systemClassificationAcknowledgedCount).toBe(system.length);
    expect(
      h.cases
        .auditFor(c.id)
        .some((event) => event.eventType === "system_classifications_acknowledged"),
    ).toBe(true);
  });

  it("produces a report in which every finding is represented or explicitly excluded", async () => {
    const c = await preparedCase(h);
    const { version, findings } = h.versions.runEngine(c.id);
    const professional = findings.filter((f) => !isSystemClassificationStatus(f.automatedStatus));
    h.human.applyDecisions(
      professional.map((f) => ({ findingId: f.findingId, decision: "accept" as const })),
    );
    h.human.acknowledgeSystemClassifications(c.id, version.versionId);
    h.versions.completeHumanReview(c.id);

    const report = h.report.generateDraft(c.id);
    const represented = new Set([
      ...report.sections.actionRequired.map((x) => x.findingId),
      ...report.sections.majorPlanGaps.map((x) => x.findingId),
      ...report.sections.qualityImprovements.map((x) => x.findingId),
      ...report.sections.guidanceNotes.map((x) => x.findingId),
      ...report.sections.needsClarificationItems.map((x) => x.findingId),
      ...report.sections.notReviewableItems.map((x) => x.findingId),
      ...report.sections.excludedFindings.map((x) => x.findingId),
    ]);

    expect(represented.size).toBe(findings.length);
    expect(report.coverage.pendingHumanDecisionCount).toBe(0);
    expect(report.coverage.systemClassificationPendingCount).toBe(0);
    expect(report.sections.notReviewableItems.length).toBe(
      findings.filter((f) => f.automatedStatus === "not_reviewable").length,
    );
  });
});
