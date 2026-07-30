// Real end-to-end journey: a genuine Arabic plan file goes in, a printable
// governed report comes out. No mocks of the domain services, no shortcuts
// around the governance gates.
import { beforeEach, describe, expect, it } from "vitest";
import {
  CaseExtractionService,
  CaseService,
  DefaultDocumentTextExtractor,
  EvidenceService,
  ExtractionRunService,
  GovernedReportService,
  HumanReviewService,
  IngestionService,
  InMemoryPlanFileStorage,
  LocalFallbackExtractionProvider,
  ReviewVersionService,
  createInMemoryRepository,
  resolveCaseNextAction,
} from "..";
import type { ReviewCaseRepository } from "..";

const PLAN_TEXT = [
  "الخطة التربوية الفردية للطالب أحمد",
  "مستوى الأداء الحالي: يقرأ الطالب عشر كلمات بصرية بشكل مستقل.",
  "الحاجة: يحتاج الطالب إلى تنمية مهارة القراءة الوظيفية.",
  "الهدف: أن يقرأ الطالب عشرين كلمة بصرية بدقة ثمانين بالمئة.",
  "الخدمة الداعمة: جلسة تربية خاصة مرتين أسبوعيًا.",
  "معيار القياس: تسجيل عدد الكلمات المقروءة أسبوعيًا.",
].join("\n");

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
    caseExtraction: new CaseExtractionService(repo),
    versions: new ReviewVersionService(repo),
    human: new HumanReviewService(repo),
    report: new GovernedReportService(repo),
  };
}

async function createCaseWithRealPlan(h: ReturnType<typeof harness>) {
  const file = new File([PLAN_TEXT], "خطة-أحمد.txt", { type: "text/plain" });
  const c = await h.cases.createCaseWithPlan({
    ageYears: 9,
    phaseId: "elementary",
    planType: "IEP",
    file: file as unknown as { name: string; size: number; type: string } & Blob,
  });
  return c;
}

describe("HIMAM — real journey from plan file to printable report", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("E2E-T01: a real Arabic TXT plan is stored and readable", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    const blob = await h.storage.get(src.id);
    expect(blob).toBeTruthy();
    expect(await blob!.text()).toContain("الخطة التربوية الفردية");
  });

  it("E2E-T02: ingestion produces chunks the reviewer can act on", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await h.ingestion.ingestSource(src.id);
    const chunks = h.repo.load().textChunks.filter((x) => x.sourceId === src.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.map((x) => x.text).join("\n")).toContain("مستوى الأداء الحالي");
  });

  it("E2E-T03: the local fallback provider proposes pending evidence without judging", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await h.ingestion.ingestSource(src.id);
    const runner = new ExtractionRunService(h.repo, new LocalFallbackExtractionProvider());
    const res = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    expect(res.createdEvidence.length).toBeGreaterThan(0);
    // Every candidate awaits a human decision and quotes the file verbatim.
    for (const ev of res.createdEvidence) {
      expect(ev.status).toBe("pending");
      expect(PLAN_TEXT).toContain(ev.exactQuote);
    }
  });

  it("E2E-T04: re-running the suggestion pass does not duplicate evidence", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await h.ingestion.ingestSource(src.id);
    const runner = new ExtractionRunService(h.repo, new LocalFallbackExtractionProvider());
    const first = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    const second = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    expect(first.createdEvidence.length).toBeGreaterThan(0);
    expect(second.createdEvidence.length).toBe(0);
  });

  it("E2E-T05: scope confirmation comes after evidence confirmation in the next-action chain", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await h.ingestion.ingestSource(src.id);
    expect(resolveCaseNextAction(c.id, h.repo).kind).toBe("confirm_evidence");

    const runner = new ExtractionRunService(h.repo, new LocalFallbackExtractionProvider());
    const res = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    for (const ev of res.createdEvidence) h.evidence.confirmEvidence(ev.id);
    h.caseExtraction.completeExtractionConfirmation(c.id);

    const next = resolveCaseNextAction(c.id, h.repo);
    expect(next.kind).toBe("confirm_scope");
    expect(next.ctaHref).toBe("/cases/$caseId/scope");
  });

  it("E2E-T06: full journey ends in an approved report with provenance and a summary", async () => {
    const c = await createCaseWithRealPlan(h);
    const src = h.cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await h.ingestion.ingestSource(src.id);

    const runner = new ExtractionRunService(h.repo, new LocalFallbackExtractionProvider());
    const res = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    for (const ev of res.createdEvidence) h.evidence.confirmEvidence(ev.id);
    h.caseExtraction.completeExtractionConfirmation(c.id);

    h.cases.generateScope(c.id);
    h.cases.confirmScope(c.id);
    h.versions.runEngine(c.id);
    for (const f of h.repo.load().reviewFindings.filter((f) => f.caseId === c.id && !f.isStale)) {
      if (f.humanReviewStatus !== "decided") {
        h.human.applyDecision({ findingId: f.findingId, decision: "accept" });
      }
    }
    h.versions.completeHumanReview(c.id);

    expect(h.report.canGenerateGovernedReport(c.id).ok).toBe(true);
    const draft = h.report.generateDraft(c.id);
    expect(draft.status).toBe("draft");
    expect(draft.sections.executiveSummary).toBeTruthy();

    // Every printed judgment carries a literal quote from the plan file.
    const judged = [
      ...draft.sections.actionRequired,
      ...draft.sections.majorPlanGaps,
      ...draft.sections.qualityImprovements,
      ...draft.sections.guidanceNotes,
    ];
    for (const item of judged) {
      expect(item.provenance.length).toBeGreaterThan(0);
      for (const p of item.provenance) {
        expect(PLAN_TEXT).toContain(p.quote);
        expect(p.locatorLabelAr.length).toBeGreaterThan(0);
      }
    }

    const approved = h.report.finalize(draft.versionId);
    expect(approved.status).toBe("final");
    expect(resolveCaseNextAction(c.id, h.repo).kind).toBe("close_case");
  });
});
