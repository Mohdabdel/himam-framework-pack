// Integration test over the SAME persistence path the browser uses:
// JSON serialized into localStorage, re-parsed and migrated on every read.
// Guards against stale-store / atomicity regressions between
// completeHumanReview → generateDraft → finalize → closeCaseAfterFinalReport.
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
  createLocalStorageRepository,
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

function installFakeLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { window: { localStorage: typeof storage } }).window = {
    localStorage: storage,
  };
  return map;
}

describe("HIMAM — browser-parity journey through localStorage repository", () => {
  let repo: ReviewCaseRepository;
  let storage: InMemoryPlanFileStorage;

  beforeEach(() => {
    installFakeLocalStorage();
    repo = createLocalStorageRepository();
    repo.reset();
    storage = new InMemoryPlanFileStorage();
  });

  it("BR-T01: decisions persist → seal → non-empty report → finalize → close", async () => {
    const cases = new CaseService(repo, storage);
    const ingestion = new IngestionService(
      repo,
      storage,
      new DefaultDocumentTextExtractor(
        async () => [],
        async () => "",
      ),
    );
    const evidence = new EvidenceService(repo);
    const caseExtraction = new CaseExtractionService(repo);
    const versions = new ReviewVersionService(repo);
    const human = new HumanReviewService(repo);
    const report = new GovernedReportService(repo);

    const file = new File([PLAN_TEXT], "خطة-أحمد.txt", { type: "text/plain" });
    const c = await cases.createCaseWithPlan({
      ageYears: 9,
      phaseId: "elementary",
      planType: "IEP",
      file: file as unknown as { name: string; size: number; type: string } & Blob,
    });
    expect(c.referenceCode).toMatch(/^RC-/);

    const src = cases.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await ingestion.ingestSource(src.id);

    const runner = new ExtractionRunService(repo, new LocalFallbackExtractionProvider());
    const res = await runner.start({ reviewCaseId: c.id, sourceId: src.id });
    expect(res.createdEvidence.length).toBeGreaterThan(0);
    for (const ev of res.createdEvidence) evidence.confirmEvidence(ev.id);
    caseExtraction.completeExtractionConfirmation(c.id);

    cases.generateScope(c.id);
    cases.confirmScope(c.id);

    const run = versions.runEngine(c.id);
    const reviewVersionId = run.version.versionId;
    expect(versions.allVersions(c.id).filter((v) => !v.isStale)).toHaveLength(1);

    // Bulk decision path — exactly what the review screen does.
    const pending = repo
      .load()
      .reviewFindings.filter(
        (f) =>
          f.caseId === c.id &&
          !f.isStale &&
          f.humanReviewStatus !== "decided" &&
          f.automatedStatus !== "not_reviewable" &&
          f.automatedStatus !== "not_applicable",
      );
    expect(pending.length).toBeGreaterThan(0);
    human.applyDecisions(
      pending.map((f) => ({ findingId: f.findingId, decision: "accept" as const })),
    );

    // Re-read from the serialized store — no in-memory shortcut.
    const reloaded = createLocalStorageRepository().load();
    const stillPendingCritical = reloaded.reviewFindings.filter(
      (f) =>
        f.caseId === c.id &&
        !f.isStale &&
        f.humanReviewStatus === "pending" &&
        f.automatedSeverity === "action_required_before_goal_approval",
    );
    expect(stillPendingCritical).toHaveLength(0);

    const sealed = versions.completeHumanReview(c.id);
    expect(sealed.versionId).toBe(reviewVersionId);
    expect(sealed.completedAt).toBeTruthy();

    expect(report.canGenerateGovernedReport(c.id).ok).toBe(true);
    const draft = report.generateDraft(c.id);
    const reportVersionId = draft.reportVersionId;
    expect(draft.status).toBe("draft");
    expect(draft.reviewVersionId).toBe(reviewVersionId);

    // The report must carry real content, not an empty skeleton.
    const judged = [
      ...draft.sections.actionRequired,
      ...draft.sections.majorPlanGaps,
      ...draft.sections.qualityImprovements,
      ...draft.sections.guidanceNotes,
      ...draft.sections.needsClarificationItems,
    ];
    expect(judged.length).toBeGreaterThan(0);
    const withProvenance = judged.filter((i) => i.provenance.length > 0);
    expect(withProvenance.length).toBeGreaterThan(0);
    for (const p of withProvenance[0].provenance) {
      expect(PLAN_TEXT).toContain(p.quote);
      expect(p.locatorLabelAr.length).toBeGreaterThan(0);
    }

    const finalized = report.finalize(reportVersionId);
    expect(finalized.status).toBe("finalized");

    expect(resolveCaseNextAction(c.id, repo).kind).toBe("close_case");
    cases.closeCaseAfterFinalReport(c.id);
    expect(repo.load().cases.find((x) => x.id === c.id)!.status).toBe("closed");
  });
});
