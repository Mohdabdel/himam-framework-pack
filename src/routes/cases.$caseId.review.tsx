import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
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
  shortCaseId,
} from "@/features/himam";
import type {
  CriterionRecord,
  FindingSeverity,
  FindingStatus,
  HumanDecision,
  ReviewCoverage,
  ReviewCase,
  ReviewFinding,
  ReviewGateResult,
  ReviewVersion,
} from "@/features/himam";

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
  [
    "critical findings still pending",
    "لا يمكن ختم المراجعة: توجد ملاحظات مطلوبة بلا قرار.",
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
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
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
        <Link to="/cases" className="text-sm underline">العودة</Link>
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
      const blocking = freshFindings.filter((f) =>
        !f.isStale && f.humanReviewStatus === "pending" &&
        f.automatedSeverity === "action_required_before_goal_approval"
      );
      if (blocking.length > 0) {
        setError(`لا يمكن ختم المراجعة: ما زالت ${blocking.length === 1 ? "نتيجة حرجة واحدة" : `${blocking.length} نتائج حرجة`} دون قرار.`);
        refresh();
        return;
      }
      services.versions.completeHumanReview(caseId);
      refresh();
    } catch (e) {
      setError(reviewErrorAr((e as Error).message));
    }
  };

  // Findings that block review completion: critical severity, still pending.
  const criticalPending = findings.filter(
    (f) =>
      !f.isStale &&
      f.humanReviewStatus === "pending" &&
      f.automatedSeverity === "action_required_before_goal_approval",
  );

  // Explicit, human-initiated bulk decision: accepts the engine's outcome
  // as-is for every blocking finding. It is still a recorded human decision
  // per finding — no automatic judgment is issued.
  const acceptAllCritical = async () => {
    setError(null);
    setBulkResult(null);
    setBulkBusy(true);
    try {
      services.human.applyDecisions(
        criticalPending.map((f) => ({ findingId: f.findingId, decision: "accept" as const })),
      );
      await Promise.resolve();
      refresh();
      const current = services.versions.currentVersion(caseId);
      const fresh = services.versions.findingsFor(caseId, current?.versionId);
      const remaining = fresh.filter((f) => !f.isStale && f.humanReviewStatus === "pending" && f.automatedSeverity === "action_required_before_goal_approval");
      setBulkResult(remaining.length === 0
        ? `حُفظت ${criticalPending.length} قرارات بنجاح. يمكن الآن ختم المراجعة.`
        : `حُفظت القرارات، وما زالت ${remaining.length} نتائج حرجة دون قرار.`);
    } catch (e) {
      setError(reviewErrorAr((e as Error).message));
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = findings.filter((f) => {
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
    <AppShell width="wide">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="مساحة المراجعة المهنية"
        stepIndicatorAr="الخطوة 6 من 8"
        descriptionAr="تشغيل محرك المراجعة الحتمي، ثم إصدار قرارات مهنية على النتائج."
        requiredNowAr={readOnly ? "عرض للقراءة فقط." : "شغّل المحرك، ثم راجع كل ملاحظة قبل ختم المراجعة."}
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
        <>
        {!readOnly && criticalPending.length > 0 && (
          <section
            data-testid="critical-pending-banner"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-semibold">
              قرارات مطلوبة قبل ختم المراجعة: {criticalPending.length}
            </p>
            <p className="mt-1">
              هذه ملاحظات تتطلب قرارًا صريحًا منك. راجعها واحدة واحدة، أو اعتمد نتيجة
              المحرك لها جميعًا بقرار واحد مسجَّل باسمك.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="filter-critical-pending"
                onClick={() =>
                  setFilters({
                    domain: "",
                    level: "",
                    status: "",
                    severity: "action_required_before_goal_approval",
                    humanDecision: "pending",
                  })
                }
                className="rounded-md border border-amber-400 bg-background px-3 py-1.5 text-xs hover:bg-accent"
              >
                عرض الملاحظات المطلوبة
              </button>
              <button
                type="button"
                data-testid="accept-all-critical"
                onClick={acceptAllCritical}
                disabled={bulkBusy}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                {bulkBusy ? "جارٍ حفظ القرارات…" : "اعتماد نتيجة المحرك لجميع الملاحظات المطلوبة"}
              </button>
            </div>
          </section>
        )}
        {bulkResult && <p role="status" data-testid="bulk-decision-result" className="mb-4 text-sm text-muted-foreground">{bulkResult}</p>}
        <section className="mb-4 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">تغطية المراجعة</h2>
            <div className="text-xs text-muted-foreground">
              نسخة {version.versionId.slice(0, 6)} · {formatArabicDate(version.createdAt)}
              {version.isStale && <span className="ms-2 text-amber-700">قديمة</span>}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            هذه ليست درجة جودة أو نجاح — بل مؤشرات تغطية عددية.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            <Kpi label="معايير نشطة" value={coverage.activeCriteriaCount} />
            <Kpi label="مراجَعة" value={coverage.reviewedCriteriaCount} />
            <Kpi label="بانتظار قرار" value={coverage.pendingHumanDecisionCount} />
            <Kpi label="غير قابلة للمراجعة" value={coverage.notReviewableCount} />
            <Kpi label="غير منطبقة" value={coverage.notApplicableCount} />
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
            <button
              type="button"
              onClick={completeReview}
              disabled={readOnly || bulkBusy || drift.drifted || criticalPending.length > 0 || Boolean(version.completedAt)}
              data-testid="complete-review-btn"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {version.completedAt ? "اكتملت المراجعة" : "ختم المراجعة"}
            </button>
            {version.completedAt && <Link
                to="/cases/$caseId/report"
                params={{ caseId }}
                data-testid="create-report-link"
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
              >إنشاء التقرير</Link>}
          </div>
          {criticalPending.length > 0 && (
            <p className="mt-2 text-xs text-amber-800" data-testid="complete-blocked-reason">
              لا يمكن ختم المراجعة قبل إصدار قرار على {criticalPending.length} ملاحظة مطلوبة.
            </p>
          )}
          {error && <p role="alert" data-testid="review-error" className="mt-2 text-sm text-destructive">{error}</p>}
        </section>
        </>
      )}

      {version && (
        <section className="mb-4 rounded-md border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">الفلاتر</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span data-testid="review-filter-count" className="text-muted-foreground">
                نتائج معروضة: {filtered.length} من {findings.length}
              </span>
              <button
                type="button"
                data-testid="review-filter-pending"
                onClick={() =>
                  setFilters({
                    domain: "",
                    level: "",
                    status: "",
                    severity: "",
                    humanDecision: "pending",
                  })
                }
                className="rounded-md border border-input px-2 py-1 hover:bg-accent"
              >
                ما ينتظر قرارًا
              </button>
              <button
                type="button"
                data-testid="review-filter-reset"
                onClick={() =>
                  setFilters({
                    domain: "",
                    level: "",
                    status: "",
                    severity: "",
                    humanDecision: "",
                  })
                }
                className="rounded-md border border-input px-2 py-1 hover:bg-accent"
              >
                إلغاء الفلاتر
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-5">
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
        </section>
      )}

      {error && (
        <p className="mb-3 text-sm text-destructive" data-testid="review-error">
          {error}
        </p>
      )}

      {version && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">لا توجد نتائج تطابق الفلاتر.</p>
      )}

      <ul className="space-y-3">
        {filtered.map((f) => (
          <FindingCard
            key={f.findingId}
            finding={f}
            criterion={services.registry.criterion(f.criterionId)}
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
        ))}
      </ul>

      <StageFooter
        backHref={`/cases/${caseId}/extraction`}
        backLabelAr="السابق: استخراج الأدلة"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="الانتقال إلى التقرير"
        continueHref={version && !drift.drifted ? `/cases/${caseId}/report` : undefined}
        continueDisabled={!version || drift.drifted}
        continueDisabledReasonAr={
          !version
            ? "شغّل محرك المراجعة أولًا."
            : drift.drifted
              ? "أعد تشغيل المحرك بعد تغيّر الأدلة."
              : undefined
        }
      />
    </AppShell>
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
  readOnly,
  onDecide,
}: {
  finding: ReviewFinding;
  criterion: CriterionRecord | null;
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
  const openerRef = useRef<HTMLButtonElement | null>(null);

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
              {HUMAN_DECISION_LABELS_AR[f.humanDecision]}
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
          تفاصيل ونتيجة المراجعة
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
