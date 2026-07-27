import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseExtractionService,
  CaseService,
  CASE_STAGE_LABELS_AR,
  JOURNEY_STATE_LABELS_AR,
  computeJourneyStatuses,
  resolveCaseNextAction,
  STATUS_BADGE_CLASSES,
  detectPhaseAgeInconsistency,
  formatArabicDate,
  getDefaultRepository,
  phaseLabelAr,
  shortCaseId,
  statusLabelAr,
} from "@/features/himam";
import type {
  CaseNextAction,
  InputSource,
  JourneyStepId,
  JourneyStepState,
  ReviewCase,
  ReviewScopeSnapshot,
} from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "حالة مراجعة — HIMAM" },
      { name: "description", content: "ملخص حالة مراجعة داخل HIMAM 1A." },
      { property: "og:title", content: "حالة مراجعة — HIMAM" },
      { property: "og:description", content: "ملخص حالة مراجعة داخل HIMAM 1A." },
    ],
  }),
  component: CaseDetail,
});

const DOMAIN_LABEL: Record<string, string> = {
  D0: "D0 — قابلية المراجعة",
  D1: "D1 — بنية الهدف",
  D2: "D2 — التخصيص وقاعدة الأدلة",
  D3: "D3 — القيمة التعليمية/الوظيفية",
  D4: "D4 — الدعم والتنفيذ",
  D5: "D5 — الأسرة والمتعلم والسياق",
  D6: "D6 — المواءمة العمرية والمآلات",
  D7: "D7 — ترابط الأهداف",
  D8: "D8 — جاهزية الرصد",
};

function ScopeDiff({
  previous,
  draft,
}: {
  previous: ReviewScopeSnapshot;
  draft: ReviewScopeSnapshot;
}) {
  const prevMap = new Map(previous.criterionScope.map((x) => [x.criterionId, x.status]));
  const draftMap = new Map(draft.criterionScope.map((x) => [x.criterionId, x.status]));
  const changed: { id: string; from: string; to: string }[] = [];
  for (const [id, to] of draftMap) {
    const from = prevMap.get(id) ?? "—";
    if (from !== to) changed.push({ id, from, to });
  }
  for (const [id, from] of prevMap) {
    if (!draftMap.has(id)) changed.push({ id, from, to: "—" });
  }
  if (changed.length === 0) {
    return <p className="text-xs text-muted-foreground">لا فروق في المعايير.</p>;
  }
  return (
    <ul className="list-inside list-disc text-xs text-amber-900">
      {changed.slice(0, 20).map((c) => (
        <li key={c.id}>
          {c.id}: {c.from} → {c.to}
        </li>
      ))}
      {changed.length > 20 && <li>… ({changed.length - 20} إضافيًا)</li>}
    </ul>
  );
}

function CaseDetail() {
  const { caseId } = Route.useParams();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [scope, setScope] = useState<ReviewScopeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastConfirmedScope, setLastConfirmedScope] = useState<ReviewScopeSnapshot | null>(null);
  const [evidenceCount, setEvidenceCount] = useState({ total: 0, pending: 0, confirmed: 0 });
  const [completeStatus, setCompleteStatus] = useState<ReturnType<
    CaseExtractionService["canCompleteExtractionConfirmation"]
  > | null>(null);
  const [nextAction, setNextAction] = useState<CaseNextAction | null>(null);

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    setSources(svc.sourcesFor(caseId));
    setScope(svc.latestScope(caseId));
    setLastConfirmedScope(svc.lastConfirmedScope(caseId));
    const repo = getDefaultRepository();
    const store = repo.load();
    const list = store.extractedEvidence.filter((e) => e.reviewCaseId === caseId);
    setEvidenceCount({
      total: list.length,
      pending: list.filter((e) => e.status === "pending").length,
      confirmed: list.filter((e) => e.status === "confirmed" || e.status === "edited").length,
    });
    const cx = new CaseExtractionService(repo);
    setCompleteStatus(cx.canCompleteExtractionConfirmation(caseId));
    setNextAction(resolveCaseNextAction(caseId, repo));
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  if (!c) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
        <Link to="/cases" className="text-sm underline">
          العودة إلى اللوحة
        </Link>
      </div>
    );
  }

  const svc = new CaseService();
  const canGenerate = c.status === "minimum_inputs_complete" || c.status === "scope_confirmed";
  const canConfirm = c.status === "minimum_inputs_complete" && !!scope;
  const canClose = c.status === "scope_confirmed";

  const journeyStatuses = computeJourneyStatuses({
    reviewCase: c,
    hasReadyPlan: sources.some(
      (s) => s.type === "plan" && s.status === "ready_for_future_ingestion",
    ),
    sourcesCount: sources.length,
    textReadyCount: sources.filter((s) => s.extractionStage === "text_extracted").length,
    pendingEvidenceCount: evidenceCount.pending,
    confirmedEvidenceCount: evidenceCount.confirmed,
    reviewFinalized: false,
    reviewStale: false,
    reportFinalized: false,
    reportStale: false,
  });
  const stepHref: Partial<Record<JourneyStepId, string>> = {
    basics: undefined,
    sources: "/cases/$caseId/sources",
    text: "/cases/$caseId/ingestion",
    evidence: "/cases/$caseId/extraction",
    scope: "/cases/$caseId/extraction",
    review: "/cases/$caseId/review",
    report: "/cases/$caseId/report",
    closure: "/cases/$caseId/report",
  };
  const stateBadge: Record<JourneyStepState, string> = {
    not_started: "bg-muted text-muted-foreground border-border",
    in_progress: "bg-sky-50 text-sky-900 border-sky-200",
    complete: "bg-emerald-50 text-emerald-900 border-emerald-200",
    needs_action: "bg-amber-50 text-amber-900 border-amber-200",
    needs_update: "bg-orange-50 text-orange-900 border-orange-200",
    read_only: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const doReconfirmScope = () => {
    setError(null);
    try {
      svc.reconfirmScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doGenerate = () => {
    setError(null);
    try {
      svc.generateScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doConfirm = () => {
    setError(null);
    try {
      svc.confirmScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doClose = () => {
    setError(null);
    try {
      svc.closeCase(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doRemove = async (sourceId: string) => {
    setError(null);
    try {
      await svc.removeSource(sourceId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-6 py-10 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">حالة مراجعة {c.referenceCode}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>المعرّف المختصر: {shortCaseId(c)}</span>
            <span>·</span>
            <span className={`rounded-full border px-2 py-0.5 ${STATUS_BADGE_CLASSES[c.status]}`}>
              {statusLabelAr(c.status)}
            </span>
          </div>
        </div>
        <Link to="/cases" className="text-sm underline">
          العودة
        </Link>
      </div>

      {nextAction && (
        <section
          className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4"
          data-testid="case-next-action"
          data-next-action-kind={nextAction.kind}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">الخطوة التالية</div>
              <div className="text-base font-semibold">{nextAction.stateSummaryAr}</div>
              {nextAction.blockedReasonAr && (
                <div
                  className="mt-1 text-xs text-amber-800"
                  data-testid="case-next-action-blocker"
                >
                  {nextAction.blockedReasonAr}
                </div>
              )}
            </div>
            {nextAction.ctaHref && nextAction.ctaEnabled ? (
              <Link
                to={nextAction.ctaHref}
                params={{ caseId }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                data-testid="case-next-action-cta"
              >
                {nextAction.ctaLabelAr}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground opacity-60"
                data-testid="case-next-action-cta"
              >
                {nextAction.ctaLabelAr}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">البيانات الأساسية</h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">العمر</dt>
            <dd>{c.ageYears !== null ? `${c.ageYears} سنة` : "غير محدد"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">المرحلة</dt>
            <dd>{phaseLabelAr(c.phaseId)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">نوع الخطة</dt>
            <dd>{c.planType ?? "غير محدد"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">الحالة</dt>
            <dd>{statusLabelAr(c.status)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
            <dd>{formatArabicDate(c.createdAt)}</dd>
          </div>
        </dl>
        {detectPhaseAgeInconsistency(c.ageYears, c.phaseId) && (
          <div
            role="note"
            data-testid="phase-age-warning"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            يرجى مراجعة المرحلة المختارة.
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">رحلة الحالة</h2>
        </div>
        <ol className="space-y-2 text-sm" data-testid="case-journey-stepper">
          {journeyStatuses.map((s, i) => {
            const href = stepHref[s.step.id];
            const openable = s.state !== "not_started" && !!href;
            return (
              <li
                key={s.step.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2"
                data-step-id={s.step.id}
                data-step-state={s.state}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{s.step.labelAr}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${stateBadge[s.state]}`}
                    >
                      {JOURNEY_STATE_LABELS_AR[s.state]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {s.step.descriptionAr}
                  </div>
                  {s.blockedReasonAr && (
                    <div className="mt-0.5 text-xs text-amber-800" data-testid={`step-blocker-${s.step.id}`}>
                      {s.blockedReasonAr}
                    </div>
                  )}
                </div>
                {href ? (
                  openable ? (
                    <Link
                      to={href}
                      params={{ caseId }}
                      className="text-xs underline"
                      data-testid={`open-step-${s.step.id}`}
                    >
                      فتح
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">مقفل</span>
                  )
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          مرحلة المعالجة الحالية: {CASE_STAGE_LABELS_AR[c.extractionStage]}
        </p>
        {completeStatus && !completeStatus.ok && c.extractionStage !== "extraction_confirmed" && (
          <p className="mt-2 text-xs text-amber-700" data-testid="journey-blocker">
            متعذر إكمال تأكيد الاستخراج: {completeStatus.reason}
          </p>
        )}
      </section>

      {c.scopeNeedsReconfirmation && lastConfirmedScope && scope && (
        <section
          className="mb-6 rounded-md border border-amber-200 bg-amber-50/50 p-4"
          data-testid="scope-diff-section"
        >
          <h2 className="mb-2 text-lg font-semibold text-amber-900">إعادة تأكيد نطاق المراجعة</h2>
          <p className="mb-2 text-xs text-amber-800">
            تغيّرت المصادر منذ آخر تأكيد. راجع الفروق قبل الإكمال.
          </p>
          <ScopeDiff previous={lastConfirmedScope} draft={scope} />
          <button
            type="button"
            onClick={doReconfirmScope}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            تأكيد نطاق المراجعة المحدَّث
          </button>
        </section>
      )}

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">مصادر المراجعة</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يُسجَّل أي مصدر. الخطة إلزامية للانتقال إلى المدخلات الدنيا.
          </p>
        ) : (
          <ul className="text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-1">
                <span className="min-w-0 truncate">
                  {s.type} — {s.fileName}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      s.status === "file_missing"
                        ? "text-destructive"
                        : s.status === "unreadable"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }
                  >
                    {s.status === "ready_for_future_ingestion"
                      ? "محفوظ محليًا"
                      : s.status === "file_missing"
                        ? "الملف مفقود"
                        : s.status === "unreadable"
                          ? "غير قابل للقراءة"
                          : "مسجَّل بدون ملف"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void doRemove(s.id)}
                    className="rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    إزالة
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          الملف يُحفظ محليًا داخل المتصفح (IndexedDB) ولا يُرفع لأي خدمة خارجية ولا يتاح كرابط عام.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          المصادر الأخرى (تقييم، أولويات الأسرة، تفضيلات المتعلم، الدعم، ملاحظات مهنية، خطة سابقة،
          تقدم سابق) مقفلة للحزم التالية.
        </p>
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">نطاق المراجعة المبدئي</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          هذه ليست نتائج مراجعة. إنها حدود المراجعة التي ستصبح ممكنة بعد تنفيذ الحزم التالية.
        </p>
        {scope ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">المدخلات المتاحة:</div>
              <div className="text-muted-foreground">{scope.inputTypes.join("، ") || "—"}</div>
            </div>
            <div>
              <div className="font-medium">المجالات المتاحة:</div>
              <ul className="list-inside list-disc text-muted-foreground">
                {scope.availableDomains.map((d) => (
                  <li key={d}>{DOMAIN_LABEL[d] ?? d}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">
                المجالات غير القابلة للمراجعة (بسبب غياب مدخل اختياري):
              </div>
              <ul className="list-inside list-disc text-muted-foreground">
                {scope.notReviewableDomains.map((d) => (
                  <li key={d}>{DOMAIN_LABEL[d] ?? d}</li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-muted-foreground">
              تاريخ الإنشاء: {new Date(scope.createdAt).toLocaleString("ar")} ·
              {scope.confirmedAt
                ? ` مؤكد في ${new Date(scope.confirmedAt).toLocaleString("ar")}`
                : " غير مؤكد"}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            لم يُولَّد نطاق بعد. أكمل المدخلات الدنيا ثم اضغط "توليد النطاق".
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={doGenerate}
            disabled={!canGenerate}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            توليد النطاق
          </button>
          <button
            onClick={doConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            تأكيد نطاق المراجعة
          </button>
          <button
            onClick={doClose}
            disabled={!canClose}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            إغلاق الحالة
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>

    </div>
  );
}
