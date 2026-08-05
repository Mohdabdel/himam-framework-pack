import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  WorkflowShell,
  DOMAIN_LABELS_AR,
  StageFooter,
  GATE_REASON_TARGET_STEP_AR,
  ResponsivePanel,
  FINDING_SEVERITY_LABELS_AR,
  FINDING_STATUS_LABELS_AR,
  HUMAN_DECISION_LABELS_AR,
  HumanReviewService,
  REVIEW_GATE_LABELS_AR,
  ReviewCoverageService,
  ReviewVersionService,
  StageHeader,
  UNCERTAINTY_LABELS_AR,
  formatArabicDate,
  getDefaultRepository,
  getKnowledgeRegistry,
  isSystemClassificationStatus,
  locatorLabelAr,
  shortCaseId,
} from "@/features/himam";
import type {
  CriterionRecord,
  ExtractedEvidence,
  FindingSeverity,
  FindingStatus,
  HumanDecision,
  ReviewCoverage,
  ReviewCase,
  ReviewFinding,
  ReviewGateResult,
  ReviewVersion,
} from "@/features/himam";
import { resolveFindingGoalEvidence } from "@/features/himam/review/finding-goal-context";

export const Route = createFileRoute("/cases/$caseId/review")({
  head: () => ({
    meta: [
      { title: "مساحة المراجعة — HIMAM" },
      { name: "description", content: "مساحة المراجعة المهنية داخل HIMAM." },
      { property: "og:title", content: "مساحة المراجعة — HIMAM" },
      { property: "og:description", content: "مساحة المراجعة المهنية داخل HIMAM." },
    ],
  }),
  component: ReviewWorkspace,
});

const ALL_STATUSES: FindingStatus[] = [
  "achieved",
  "partially_achieved",
  "not_achieved",
  "needs_clarification",
  "not_reviewable",
  "not_applicable",
];

const ALL_SEVERITIES: FindingSeverity[] = [
  "action_required_before_goal_approval",
  "major_plan_gap",
  "quality_improvement",
  "guidance_note",
  "no_judgment",
];

type ReviewTaskView = "professional" | "system" | "completed" | "all";

function useServices() {
  return useMemo(() => {
    const repo = getDefaultRepository();
    return {
      repo,
      versions: new ReviewVersionService(repo),
      human: new HumanReviewService(repo),
      coverage: new ReviewCoverageService(repo),
      registry: getKnowledgeRegistry(),
    };
  }, []);
}

// Engine errors are technical strings; the reviewer only ever sees Arabic.
const REVIEW_ERROR_AR: Array<[string, string]> = [
  ["critical findings still pending", "لا يمكن ختم المراجعة: توجد ملاحظات مطلوبة بلا قرار."],
  [
    "professional findings still pending",
    "لا يمكن ختم المراجعة: توجد نتائج مهنية لم يصدر قرار بشأنها.",
  ],
  [
    "system classifications still require acknowledgement",
    "لا يمكن ختم المراجعة: راجع التصنيفات النظامية وأقرّ بها أولًا.",
  ],
  ["scope needs reconfirmation", "لا يمكن ختم المراجعة: النطاق يحتاج إلى إعادة تأكيد."],
  ["No active review version", "لم يُشغَّل محرك المراجعة بعد."],
  ["Case is closed", "الحالة مغلقة — العرض للقراءة فقط."],
  ["stale finding", "هذه الملاحظة قديمة — أعد تشغيل المحرك."],
  ["Cannot complete review", "تعذّر ختم المراجعة — أعد تشغيل المحرك ثم حاول مجددًا."],
];

function reviewErrorAr(message: string): string {
  for (const [needle, ar] of REVIEW_ERROR_AR) {
    if (message.includes(needle)) return ar;
  }
  return "تعذّر إتمام الإجراء. راجع الخطوات السابقة ثم حاول مجددًا.";
}

function ReviewWorkspace() {
  const { caseId } = Route.useParams();
  const services = useServices();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [gate, setGate] = useState<ReviewGateResult | null>(null);
  const [version, setVersion] = useState<ReviewVersion | null>(null);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [coverage, setCoverage] = useState<ReviewCoverage | null>(null);
  const [evidence, setEvidence] = useState<ExtractedEvidence[]>([]);
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<ReviewTaskView>("professional");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    domain: "" as string,
    level: "" as string,
    status: "" as FindingStatus | "",
    severity: "" as FindingSeverity | "",
    humanDecision: "" as HumanDecision | "pending" | "",
  });
  const [drift, setDrift] = useState<{ drifted: boolean; reason: string | null }>({
    drifted: false,
    reason: null,
  });

  const refresh = useCallback(() => {
    const store = services.repo.load();
    const found = store.cases.find((x) => x.id === caseId) ?? null;
    setC(found);
    if (!found) return;
    setGate(services.versions.canOpenReview(caseId));
    const cur = services.versions.currentVersion(caseId);
    setVersion(cur);
    setFindings(services.versions.findingsFor(caseId, cur?.versionId));
    setEvidence(store.extractedEvidence.filter((item) => item.reviewCaseId === caseId));
    setSourceNames(
      Object.fromEntries(
        store.sources
          .filter((source) => source.reviewCaseId === caseId)
          .map((source) => [source.id, source.fileName]),
      ),
    );
    setCoverage(services.coverage.compute(caseId, cur?.versionId));
    setDrift(services.versions.detectDrift(caseId));
  }, [caseId, services]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
        <Link to="/cases" className="text-sm underline">
          العودة
        </Link>
      </AppShell>
    );
  }

  const readOnly = c.status === "closed";
  const canRun = gate?.ok === true && !readOnly;

  const runEngine = () => {
    setError(null);
    try {
      services.versions.runEngine(caseId, "manual_run");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const completeReview = async () => {
    setError(null);
    try {
      refresh();
      await Promise.resolve();
      const freshVersion = services.versions.currentVersion(caseId);
      const freshFindings = services.versions.findingsFor(caseId, freshVersion?.versionId);
      const blocking = freshFindings.filter((f) => !f.isStale && f.humanReviewStatus === "pending");
      if (blocking.length > 0) {
        setError(
          `لا يمكن ختم المراجعة: ما زالت ${blocking.length === 1 ? "نتيجة واحدة" : `${blocking.length} نتائج`} دون تسوية موثقة.`,
        );
        refresh();
        return;
      }
      services.versions.completeHumanReview(caseId);
      refresh();
    } catch (e) {
      setError(reviewErrorAr((e as Error).message));
    }
  };

  const pendingFindings = findings.filter((f) => !f.isStale && f.humanReviewStatus === "pending");
  const professionalPending = pendingFindings.filter(
    (f) => !isSystemClassificationStatus(f.automatedStatus),
  );
  const systemPending = pendingFindings.filter((f) =>
    isSystemClassificationStatus(f.automatedStatus),
  );

  // Critical findings remain visually prioritised, but every professional
  // finding now requires a decision before completion.
  const criticalPending = findings.filter(
    (f) =>
      !f.isStale &&
      f.humanReviewStatus === "pending" &&
      f.automatedSeverity === "action_required_before_goal_approval",
  );
  const completedFindings = findings.filter((f) => !f.isStale && f.humanReviewStatus === "decided");
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  const resetAdvancedFilters = () =>
    setFilters({
      domain: "",
      level: "",
      status: "",
      severity: "",
      humanDecision: "",
    });

  const showTaskView = (view: ReviewTaskView) => {
    resetAdvancedFilters();
    setTaskView(view);
  };

  const acknowledgeSystemClassifications = async () => {
    if (!version) return;
    setError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      const acknowledged = services.human.acknowledgeSystemClassifications(
        caseId,
        version.versionId,
      );
      await Promise.resolve();
      refresh();
      setBulkResult(
        acknowledged.length > 0
          ? `تم تسجيل الإقرار على ${acknowledged.length} تصنيفًا نظاميًا وإدراجها ضمن سجل التقرير.`
          : "لا توجد تصنيفات نظامية معلقة.",
      );
    } catch (e) {
      setError(reviewErrorAr((e as Error).message));
    } finally {
      setBulkBusy(false);
    }
  };

  const taskFindings = findings.filter((f) => {
    if (taskView === "professional") {
      return f.humanReviewStatus === "pending" && !isSystemClassificationStatus(f.automatedStatus);
    }
    if (taskView === "system") return isSystemClassificationStatus(f.automatedStatus);
    if (taskView === "completed") return f.humanReviewStatus === "decided";
    return true;
  });

  const filtered = taskFindings.filter((f) => {
    if (filters.domain && f.domainId !== filters.domain) return false;
    if (filters.level && f.reviewLevel !== filters.level) return false;
    if (filters.status && f.automatedStatus !== filters.status) return false;
    if (filters.severity && f.automatedSeverity !== filters.severity) return false;
    if (filters.humanDecision === "pending" && f.humanReviewStatus !== "pending") return false;
    if (
      filters.humanDecision &&
      filters.humanDecision !== "pending" &&
      f.humanDecision !== filters.humanDecision
    )
      return false;
    return true;
  });

  return (
    <WorkflowShell caseId={caseId} currentStep="review" width="wide">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="مساحة المراجعة المهنية"
        stepIndicatorAr="الخطوة 6 من 8"
        descriptionAr="تشغيل محرك المراجعة الحتمي، ثم إصدار قرارات مهنية على النتائج."
        requiredNowAr={
          readOnly
            ? "عرض للقراءة فقط."
            : !version
              ? "شغّل محرك المراجعة لبدء العمل."
              : professionalPending.length > 0
                ? `أصدر قرارًا مهنيًا على ${professionalPending.length} نتيجة.`
                : systemPending.length > 0
                  ? `راجع ${systemPending.length} تصنيفًا نظاميًا ثم سجّل إقرارك.`
                  : version.completedAt
                    ? "اكتملت المراجعة — انتقل إلى التقرير."
                    : "جميع النتائج مسوّاة — اختم المراجعة."
        }
        statusLabelAr={readOnly ? "للقراءة فقط" : "نشطة"}
        statusVariant={readOnly ? "locked" : "info"}
        trailing={
          <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
            العودة إلى الحالة
          </Link>
        }
      />

      {gate && !gate.ok && (
        <section
          data-testid="review-gate-block"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-semibold mb-1">لا يمكن فتح المراجعة التشغيلية.</p>
          <p>{REVIEW_GATE_LABELS_AR[gate.reason] ?? gate.reason}</p>
          {GATE_REASON_TARGET_STEP_AR[gate.reason] && (
            <a
              href={`/cases/${caseId}${GATE_REASON_TARGET_STEP_AR[gate.reason].hrefSuffix}`}
              data-testid="review-gate-goto-step"
              className="mt-2 inline-flex rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              {GATE_REASON_TARGET_STEP_AR[gate.reason].labelAr}
            </a>
          )}
        </section>
      )}

      {gate?.ok && !version && (
        <section className="mb-4 rounded-md border border-border p-4 text-sm">
          <p className="mb-3">لم يُشغَّل محرك المراجعة بعد.</p>
          <button
            type="button"
            onClick={runEngine}
            disabled={!canRun}
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            تشغيل محرك المراجعة
          </button>
        </section>
      )}

      {version && coverage && (
        <section
          data-testid="review-task-center"
          className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">المهام المطلوبة الآن</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                اعمل على نوع واحد من النتائج في كل مرة. لا يمكن للفلاتر المتقدمة تغيير أعداد المهام.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              نسخة {version.versionId.slice(0, 6)} · {formatArabicDate(version.createdAt)}
            </div>
          </div>

          <div
            className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"
            role="tablist"
            aria-label="أنواع مهام المراجعة"
          >
            <TaskViewButton
              active={taskView === "professional"}
              label="قرارات مهنية"
              value={professionalPending.length}
              attention={criticalPending.length > 0}
              onClick={() => showTaskView("professional")}
              testId="review-view-professional"
            />
            <TaskViewButton
              active={taskView === "system"}
              label="تصنيفات نظامية"
              value={systemPending.length}
              onClick={() => showTaskView("system")}
              testId="review-view-system"
            />
            <TaskViewButton
              active={taskView === "completed"}
              label="مكتملة"
              value={completedFindings.length}
              onClick={() => showTaskView("completed")}
              testId="review-view-completed"
            />
            <TaskViewButton
              active={taskView === "all"}
              label="جميع النتائج"
              value={findings.length}
              onClick={() => showTaskView("all")}
              testId="review-view-all"
            />
          </div>

          {taskView === "professional" && professionalPending.length > 0 && (
            <div
              data-testid={
                criticalPending.length > 0
                  ? "critical-pending-banner"
                  : "professional-pending-banner"
              }
              className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <p className="font-semibold">
                {criticalPending.length > 0
                  ? `${criticalPending.length} نتائج حرجة تتطلب قرارًا فرديًا`
                  : `${professionalPending.length} نتائج مهنية تتطلب قرارًا`}
              </p>
              <p className="mt-1 text-xs">
                افتح كل نتيجة، راجع الهدف والدليل، ثم أصدر قرارك. لا يعتمد النظام النتائج الحرجة
                جماعيًا.
              </p>
              {criticalPending.length > 0 && (
                <button
                  type="button"
                  data-testid="filter-critical-pending"
                  onClick={() => {
                    setTaskView("professional");
                    setFilters({
                      domain: "",
                      level: "",
                      status: "",
                      severity: "action_required_before_goal_approval",
                      humanDecision: "pending",
                    });
                  }}
                  className="mt-2 rounded-md border border-amber-400 bg-background px-3 py-1.5 text-xs hover:bg-accent"
                >
                  عرض النتائج الحرجة فقط
                </button>
              )}
            </div>
          )}

          {taskView === "system" && systemPending.length > 0 && (
            <div
              data-testid="system-classification-banner"
              className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900"
            >
              <p className="font-semibold">راجع التصنيفات النظامية قبل الإقرار</p>
              <p className="mt-1 text-xs">
                غير قابلة للمراجعة: {coverage.notReviewableCount} · غير منطبقة:{" "}
                {coverage.notApplicableCount}. سيُحفظ كل عنصر في التقرير أو سجل الاستبعاد.
              </p>
              <button
                type="button"
                data-testid="acknowledge-system-classifications"
                onClick={acknowledgeSystemClassifications}
                disabled={bulkBusy}
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {bulkBusy ? "جارٍ تسجيل الإقرار…" : "راجعت التصنيفات وأقرّ بها"}
              </button>
            </div>
          )}

          {!readOnly && pendingFindings.length === 0 && !version.completedAt && (
            <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="font-semibold">تمت تسوية جميع النتائج</p>
              <p className="mt-1 text-xs">اختم نسخة المراجعة الحالية قبل الانتقال إلى التقرير.</p>
              <button
                type="button"
                onClick={completeReview}
                disabled={bulkBusy || drift.drifted}
                data-testid="complete-review-btn"
                className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                ختم المراجعة
              </button>
            </div>
          )}

          {version.completedAt && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              <span className="font-semibold">اكتملت المراجعة وأصبحت جاهزة للتقرير.</span>
              <Link
                to="/cases/$caseId/report"
                params={{ caseId }}
                data-testid="create-report-link"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                التالي: إنشاء التقرير
              </Link>
            </div>
          )}

          {bulkResult && (
            <p
              role="status"
              data-testid="bulk-decision-result"
              className="mb-4 text-sm text-muted-foreground"
            >
              {bulkResult}
            </p>
          )}
          <details className="mt-4 rounded-md border border-border/70 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              عرض تفاصيل التغطية والنسخة
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              مؤشرات تغطية عددية وليست درجة جودة أو نجاح.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
              <Kpi label="معايير نشطة" value={coverage.activeCriteriaCount} />
              <Kpi label="مراجَعة" value={coverage.reviewedCriteriaCount} />
              <Kpi label="بانتظار قرار" value={coverage.pendingHumanDecisionCount} />
              <Kpi label="غير قابلة للمراجعة" value={coverage.notReviewableCount} />
              <Kpi label="غير منطبقة" value={coverage.notApplicableCount} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              <Kpi label="تصنيفات نظامية" value={coverage.systemClassificationCount} />
              <Kpi label="تم الإقرار بها" value={coverage.systemClassificationAcknowledgedCount} />
              <Kpi label="تنتظر الإقرار" value={coverage.systemClassificationPendingCount} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
              <Kpi label="اعتماد" value={coverage.acceptedCount} />
              <Kpi label="تعديل" value={coverage.modifiedCount} />
              <Kpi label="رفض" value={coverage.rejectedCount} />
              <Kpi label="طلب معلومات" value={coverage.requestedInfoCount} />
              <Kpi label="تأجيل" value={coverage.deferredCount} />
            </div>
            {drift.drifted && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                تغيّرت الأدلة أو النطاق منذ آخر تشغيل. النتائج قديمة — يلزم إعادة التشغيل.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runEngine}
                disabled={readOnly}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                إعادة تشغيل المحرك
              </button>
            </div>
            {pendingFindings.length > 0 && (
              <p className="mt-2 text-xs text-amber-800" data-testid="complete-blocked-reason">
                لا يمكن ختم المراجعة قبل تسوية {pendingFindings.length} نتيجة:{" "}
                {professionalPending.length} قرارًا مهنيًا و{systemPending.length} تصنيفًا نظاميًا.
              </p>
            )}
          </details>
        </section>
      )}

      {version && (
        <section className="mb-4 rounded-md border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {filtersOpen ? "إخفاء خيارات التصفية" : "إظهار خيارات التصفية"}
            </button>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span data-testid="review-filter-count" className="text-muted-foreground">
                نتائج معروضة: {filtered.length} من {taskFindings.length}
              </span>
              <button
                type="button"
                data-testid="review-filter-pending"
                onClick={() => showTaskView("professional")}
                className="rounded-md border border-input px-2 py-1 hover:bg-accent"
              >
                القرارات المطلوبة
              </button>
              <button
                type="button"
                data-testid="review-filter-reset"
                onClick={resetAdvancedFilters}
                className="rounded-md border border-input px-2 py-1 hover:bg-accent"
              >
                إعادة ضبط التصفية
              </button>
            </div>
          </div>
          {filtersOpen && (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-5">
              <select
                className="rounded-md border border-input p-1.5"
                value={filters.domain}
                onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
              >
                <option value="">كل المجالات</option>
                {Object.entries(DOMAIN_LABELS_AR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {k} — {v}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-input p-1.5"
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              >
                <option value="">كل المستويات</option>
                <option value="أساسي">أساسي</option>
                <option value="تحسين جودة">تحسين جودة</option>
              </select>
              <select
                className="rounded-md border border-input p-1.5"
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value as FindingStatus | "" })
                }
              >
                <option value="">كل الحالات</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {FINDING_STATUS_LABELS_AR[s]}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-input p-1.5"
                value={filters.severity}
                onChange={(e) =>
                  setFilters({ ...filters, severity: e.target.value as FindingSeverity | "" })
                }
              >
                <option value="">كل الدرجات</option>
                {ALL_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {FINDING_SEVERITY_LABELS_AR[s]}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-input p-1.5"
                value={filters.humanDecision}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    humanDecision: e.target.value as HumanDecision | "pending" | "",
                  })
                }
              >
                <option value="">كل قرارات المراجع</option>
                <option value="pending">بانتظار قرار</option>
                {(Object.keys(HUMAN_DECISION_LABELS_AR) as HumanDecision[]).map((k) => (
                  <option key={k} value={k}>
                    {HUMAN_DECISION_LABELS_AR[k]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
      )}

      {error && (
        <p className="mb-3 text-sm text-destructive" data-testid="review-error">
          {error}
        </p>
      )}

      {version && filtered.length === 0 && (
        <section
          data-testid="review-empty-state"
          className="mb-4 rounded-md border border-dashed border-border p-4 text-sm"
        >
          <p className="font-medium">
            {taskView === "professional" && professionalPending.length === 0
              ? "اكتملت جميع القرارات المهنية."
              : "لا توجد نتائج ظاهرة ضمن العرض الحالي."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {taskView === "professional" && systemPending.length > 0
              ? "الخطوة التالية هي مراجعة التصنيفات النظامية والإقرار بها."
              : "قد تكون خيارات التصفية المتقدمة هي التي أخفت النتائج."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {taskView === "professional" && systemPending.length > 0 && (
              <button
                type="button"
                onClick={() => showTaskView("system")}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                التالي: مراجعة التصنيفات النظامية
              </button>
            )}
            <button
              type="button"
              onClick={resetAdvancedFilters}
              className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
            >
              إعادة ضبط التصفية
            </button>
          </div>
        </section>
      )}

      <ul className="space-y-3">
        {filtered.map((f) => {
          const goalEvidence = resolveFindingGoalEvidence(f, evidenceById);
          return (
            <FindingCard
              key={f.findingId}
              finding={f}
              criterion={services.registry.criterion(f.criterionId)}
              goalEvidence={goalEvidence}
              goalSourceName={goalEvidence ? sourceNames[goalEvidence.sourceId] : undefined}
              readOnly={readOnly}
              onDecide={(input) => {
                setError(null);
                try {
                  services.human.applyDecision(input);
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          );
        })}
      </ul>

      <StageFooter
        backHref={`/cases/${caseId}/extraction`}
        backLabelAr="السابق: استخراج الأدلة"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="الانتقال إلى التقرير"
        continueHref={
          version?.completedAt && !drift.drifted ? `/cases/${caseId}/report` : undefined
        }
        continueDisabled={!version?.completedAt || drift.drifted}
        continueDisabledReasonAr={
          !version
            ? "شغّل محرك المراجعة أولًا."
            : drift.drifted
              ? "أعد تشغيل المحرك بعد تغيّر الأدلة."
              : !version.completedAt
                ? "أكمل جميع القرارات والإقرارات ثم اختم المراجعة."
                : undefined
        }
      />
    </WorkflowShell>
  );
}

function TaskViewButton({
  active,
  label,
  value,
  attention = false,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  value: number;
  attention?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={`rounded-md border p-3 text-start transition-colors ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-background hover:bg-accent"
      }`}
    >
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className={`mt-1 block text-xl font-semibold ${attention ? "text-amber-800" : ""}`}>
        {value}
      </span>
    </button>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function FindingCard({
  finding: f,
  criterion,
  goalEvidence,
  goalSourceName,
  readOnly,
  onDecide,
}: {
  finding: ReviewFinding;
  criterion: CriterionRecord | null;
  goalEvidence: ExtractedEvidence | null;
  goalSourceName?: string;
  readOnly: boolean;
  onDecide: (input: {
    findingId: string;
    decision: HumanDecision;
    humanStatus?: FindingStatus;
    humanSeverity?: FindingSeverity;
    humanRationale?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [modifyStatus, setModifyStatus] = useState<FindingStatus>(f.automatedStatus);
  const [modifySeverity, setModifySeverity] = useState<FindingSeverity>(f.automatedSeverity);
  const [rationale, setRationale] = useState("");
  const [goalExpanded, setGoalExpanded] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const systemClassification = isSystemClassificationStatus(f.automatedStatus);

  return (
    <li
      data-testid="finding-card"
      className={`rounded-md border p-3 text-sm ${f.isStale ? "border-amber-300 bg-amber-50/40" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="me-2 rounded-full border border-border px-2 py-0.5 text-xs">
            {f.criterionId}
          </span>
          <span className="text-xs text-muted-foreground">
            {DOMAIN_LABELS_AR[f.domainId] ?? f.domainId} · {f.reviewLevel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {FINDING_STATUS_LABELS_AR[f.automatedStatus]}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            {FINDING_SEVERITY_LABELS_AR[f.automatedSeverity]}
          </span>
          {f.humanDecision ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5">
              {systemClassification
                ? "تم الإقرار بالتصنيف"
                : HUMAN_DECISION_LABELS_AR[f.humanDecision]}
            </span>
          ) : (
            <span
              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900"
              data-testid="finding-awaiting-decision"
            >
              بانتظار قرار المراجع
            </span>
          )}
        </div>
      </div>
      {criterion && (
        <p className="mt-1 text-sm font-medium">{criterion.reviewQuestion || criterion.nameAr}</p>
      )}
      {f.targetType === "plan_goal" && goalEvidence && (
        <div className="group relative mt-2 max-w-3xl">
          <button
            type="button"
            data-testid="goal-context-trigger"
            aria-expanded={goalExpanded}
            onClick={() => setGoalExpanded((expanded) => !expanded)}
            className="w-full rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-start text-xs text-sky-950 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <span className="font-semibold">الهدف في الخطة: </span>
            <span>{goalEvidence.exactQuote}</span>
          </button>
          <div
            role="tooltip"
            data-testid="goal-context-tooltip"
            className="pointer-events-none absolute bottom-full z-20 mb-2 hidden max-w-xl rounded-md bg-slate-950 p-3 text-xs leading-6 text-white shadow-lg group-hover:block group-focus-within:block"
          >
            النص الأصلي في الخطة: {goalEvidence.exactQuote}
          </div>
          {goalExpanded && (
            <div
              data-testid="goal-context-expanded"
              className="mt-2 rounded-md border border-sky-200 bg-background p-3 text-xs leading-6"
            >
              <p className="font-medium">{goalEvidence.exactQuote}</p>
              <p className="mt-1 text-muted-foreground">
                المصدر: {goalSourceName ?? "ملف الخطة"} · {locatorLabelAr(goalEvidence.locator)}
              </p>
            </div>
          )}
        </div>
      )}
      {f.targetType === "plan_goal" && !goalEvidence && (
        <p
          data-testid="goal-context-missing"
          className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950"
        >
          تعذّر ربط رمز الهدف بالنص الأصلي المؤكد في الخطة. لا تصدر قرارًا قبل مراجعة الاستخراج.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          الأدلة: {f.evidenceIds.length} · المصادر: {f.sourceIds.length}
        </span>
        <span data-testid="finding-uncertainty">
          درجة عدم اليقين: {UNCERTAINTY_LABELS_AR[f.uncertainty]}
        </span>
        <button
          type="button"
          ref={openerRef}
          data-testid={`open-finding-panel-${f.findingId}`}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-md border border-input px-2 py-1 text-xs text-foreground hover:bg-accent"
        >
          {systemClassification ? "عرض السبب والسياق" : "مراجعة وإصدار القرار"}
        </button>
      </div>
      {f.isStale && (
        <p className="mt-2 text-xs text-amber-800" data-testid="finding-stale-note">
          هذه النتيجة قديمة — أعد تشغيل المحرك قبل اتخاذ قرار.
        </p>
      )}

      {open && (
        <ResponsivePanel
          open
          data-testid="finding-panel"
          titleAr={`النتيجة ${f.criterionId}`}
          descriptionAr={criterion?.reviewQuestion || criterion?.nameAr || undefined}
          dirty={rationale.trim().length > 0}
          onClose={() => setOpen(false)}
          returnFocusTo={openerRef}
        >
          <div className="space-y-3 text-xs">
            {f.targetType === "plan_goal" && goalEvidence && (
              <div
                data-testid="goal-context-in-decision"
                className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-950"
              >
                <div className="font-semibold">الهدف الأصلي محل القرار</div>
                <p className="mt-1 leading-6">{goalEvidence.exactQuote}</p>
                <p className="mt-1 text-sky-800">
                  {goalSourceName ?? "ملف الخطة"} · {locatorLabelAr(goalEvidence.locator)}
                </p>
              </div>
            )}
            {f.targetType === "plan_goal" && !goalEvidence && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                تعذّر إظهار النص الأصلي للهدف. ارجع إلى استخراج الأدلة قبل اتخاذ القرار.
              </div>
            )}
            <div>
              <div className="font-medium">تفسير النتيجة</div>
              <p className="mt-1 text-muted-foreground">{f.rationale}</p>
            </div>
            {f.limitations && (
              <div>
                <div className="font-medium">قيود</div>
                <p className="mt-1 text-muted-foreground">{f.limitations}</p>
              </div>
            )}
            <div>
              <div className="font-medium">الأدلة والمصادر</div>
              <p className="mt-1 text-muted-foreground">
                عدد الأدلة: {f.evidenceIds.length} · عدد المصادر: {f.sourceIds.length}
              </p>
            </div>
            {f.humanStatus && (
              <p>
                قرار المراجع: {FINDING_STATUS_LABELS_AR[f.humanStatus]}
                {f.humanSeverity && ` · ${FINDING_SEVERITY_LABELS_AR[f.humanSeverity]}`}
              </p>
            )}
            {f.humanRationale && (
              <p className="text-muted-foreground">مبرر المراجع: {f.humanRationale}</p>
            )}

            {readOnly ? (
              <p className="text-muted-foreground">الحالة مغلقة — عرض للقراءة فقط.</p>
            ) : f.isStale ? (
              <p className="text-amber-800">أعد تشغيل المحرك لتحديث النتيجة قبل القرار.</p>
            ) : systemClassification && f.humanReviewStatus === "pending" ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800">
                هذا تصنيف نظامي لا يمثل حكمًا مهنيًا. راجع السبب والسياق، ثم استخدم الإقرار الجماعي
                من تبويب «تصنيفات نظامية».
              </p>
            ) : (
              <div className="space-y-2 rounded-md border border-border/60 p-2">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <select
                    data-autofocus
                    aria-label="حالة النتيجة بعد التعديل"
                    className="rounded-md border border-input p-1.5 text-xs"
                    value={modifyStatus}
                    onChange={(e) => setModifyStatus(e.target.value as FindingStatus)}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FINDING_STATUS_LABELS_AR[s]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="درجة الأهمية بعد التعديل"
                    className="rounded-md border border-input p-1.5 text-xs"
                    value={modifySeverity}
                    onChange={(e) => setModifySeverity(e.target.value as FindingSeverity)}
                  >
                    {ALL_SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {FINDING_SEVERITY_LABELS_AR[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  placeholder="مبرر المراجع (اختياري)"
                  aria-label="مبرر المراجع"
                  className="w-full rounded-md border border-input p-1.5 text-xs"
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "accept",
                      "modify",
                      "reject",
                      "request_more_information",
                      "defer",
                    ] as HumanDecision[]
                  ).map((d) => (
                    <button
                      key={d}
                      type="button"
                      data-testid={`finding-decision-${d}`}
                      className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => {
                        onDecide({
                          findingId: f.findingId,
                          decision: d,
                          humanStatus: d === "modify" ? modifyStatus : undefined,
                          humanSeverity: d === "modify" ? modifySeverity : undefined,
                          humanRationale: rationale || undefined,
                        });
                        setRationale("");
                        setOpen(false);
                      }}
                    >
                      {HUMAN_DECISION_LABELS_AR[d]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ResponsivePanel>
      )}
    </li>
  );
}
