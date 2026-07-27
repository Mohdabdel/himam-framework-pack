import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AppShell,
  CaseExtractionService,
  CaseService,
  CASE_STAGE_LABELS_AR,
  computeJourneyStatuses,
  resolveCaseNextAction,
  JourneyStepper,
  NextActionCard,
  PrimaryActionsBar,
  SOURCE_TYPE_LABELS_AR,
  StageHeader,
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
  PrimaryActionSpec,
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
  D0: "قابلية المراجعة",
  D1: "بنية الهدف",
  D2: "التخصيص وقاعدة الأدلة",
  D3: "القيمة التعليمية والوظيفية",
  D4: "الدعم والتنفيذ",
  D5: "الأسرة والمتعلم والسياق",
  D6: "المواءمة العمرية والمآلات",
  D7: "ترابط الأهداف",
  D8: "جاهزية الرصد",
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
  const [reviewState, setReviewState] = useState({ finalized: false, stale: false });
  const [reportState, setReportState] = useState({ finalized: false, stale: false });

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
    const rvs = store.reviewVersions.filter((v) => v.caseId === caseId);
    const rvLive = rvs.filter((v) => !v.isStale).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setReviewState({
      finalized: !!rvLive?.completedAt,
      stale: rvs.length > 0 && !rvLive,
    });
    const reps = store.reportVersions.filter((r) => r.caseId === caseId);
    const repLive = reps.find((r) => r.status === "finalized") ?? null;
    setReportState({
      finalized: !!repLive,
      stale: reps.some((r) => r.status === "stale") && !repLive,
    });
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
        <Link to="/cases" className="text-sm underline">
          العودة إلى اللوحة
        </Link>
      </AppShell>
    );
  }

  const svc = new CaseService();
  const readOnly = c.status === "closed";

  const journeyStatuses = computeJourneyStatuses({
    reviewCase: c,
    hasReadyPlan: sources.some(
      (s) => s.type === "plan" && s.status === "ready_for_future_ingestion",
    ),
    sourcesCount: sources.length,
    textReadyCount: sources.filter((s) => s.extractionStage === "text_extracted").length,
    pendingEvidenceCount: evidenceCount.pending,
    confirmedEvidenceCount: evidenceCount.confirmed,
    reviewFinalized: reviewState.finalized,
    reviewStale: reviewState.stale,
    reportFinalized: reportState.finalized,
    reportStale: reportState.stale,
  });
  const stepHref: Partial<Record<JourneyStepId, string>> = {
    basics: undefined,
    sources: "/cases/$caseId/sources",
    text: "/cases/$caseId/ingestion",
    evidence: "/cases/$caseId/extraction",
    scope: "/cases/$caseId/scope",
    review: "/cases/$caseId/review",
    report: "/cases/$caseId/report",
    closure: "/cases/$caseId/report",
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

  // Grouped source summary (count per type, in Arabic).
  const sourceGroups = (() => {
    const g = new Map<string, number>();
    for (const s of sources) g.set(s.type, (g.get(s.type) ?? 0) + 1);
    return [...g.entries()];
  })();

  const bottomActions: PrimaryActionSpec[] = [
    {
      id: "back-to-list",
      labelAr: "العودة إلى قائمة الحالات",
      variant: "ghost",
      href: "/cases",
    },
  ];
  if (nextAction?.ctaEnabled && nextAction.ctaHref) {
    const href = nextAction.ctaHref.replace("$caseId", caseId);
    bottomActions.push({
      id: "next-action",
      labelAr: nextAction.ctaLabelAr,
      variant: "primary",
      href,
    });
  } else if (nextAction) {
    bottomActions.push({
      id: "next-action",
      labelAr: nextAction.ctaLabelAr,
      variant: "primary",
      disabled: true,
      disabledReasonAr: nextAction.blockedReasonAr ?? undefined,
    });
  }

  return (
    <AppShell width="regular">
      <StageHeader
        caseCodeAr={`حالة مراجعة ${c.referenceCode}`}
        titleAr={c.planType ? `${c.planType} — ${phaseLabelAr(c.phaseId)}` : `مراجعة ${phaseLabelAr(c.phaseId)}`}
        statusLabelAr={statusLabelAr(c.status)}
        statusVariant="info"
        trailing={
          <Link to="/cases" className="text-sm underline">
            العودة
          </Link>
        }
      />

      {nextAction && (
        <div className="mb-6">
          <NextActionCard action={nextAction} caseId={caseId} />
        </div>
      )}

      <section className="mb-6 rounded-md border border-border p-4" data-testid="basics-summary">
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
        <JourneyStepper caseId={caseId} statuses={journeyStatuses} stepHref={stepHref} />
        <p className="mt-3 text-xs text-muted-foreground">
          المرحلة الحالية: {CASE_STAGE_LABELS_AR[c.extractionStage]}
        </p>
        {completeStatus && !completeStatus.ok && c.extractionStage !== "extraction_confirmed" && (
          <p className="mt-2 text-xs text-amber-700" data-testid="journey-blocker">
            تعذّر إكمال تأكيد الأدلة بعد.
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
            data-testid="reconfirm-scope-btn"
            onClick={doReconfirmScope}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            تأكيد نطاق المراجعة المحدَّث
          </button>
        </section>
      )}

      <section className="mb-6 rounded-md border border-border p-4" data-testid="sources-summary">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">ملخص المصادر</h2>
          <Link
            to="/cases/$caseId/sources"
            params={{ caseId }}
            className="text-xs underline"
            data-testid="open-sources-link"
          >
            إدارة المصادر
          </Link>
        </div>
        {sourceGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم تُسجَّل أي مصادر بعد. ابدأ بإرفاق الخطة الحالية.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {sourceGroups.map(([type, count]) => (
              <li
                key={type}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5"
              >
                <span>{SOURCE_TYPE_LABELS_AR[type as keyof typeof SOURCE_TYPE_LABELS_AR] ?? type}</span>
                <span className="text-xs text-muted-foreground">
                  {count === 1 ? "مصدر واحد" : `${count} مصادر`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <PrimaryActionsBar actions={bottomActions} align="between" />
    </AppShell>
  );
}
