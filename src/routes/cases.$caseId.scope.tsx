import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AppShell,
  WorkflowShell,
  CaseService,
  StageFooter,
  StageHeader,
  StatusBadge,
  GateReason,
  countScopeBuckets,
  computeProvisionalScope,
} from "@/features/himam";
import type { ReviewCase, ReviewInputType, ReviewScopeSnapshot } from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId/scope")({
  head: () => ({
    meta: [
      { title: "تأكيد نطاق المراجعة — HIMAM" },
      { name: "description", content: "مقارنة النطاق المبدئي بالنطاق النهائي قبل بدء المراجعة." },
      { property: "og:title", content: "تأكيد نطاق المراجعة — HIMAM" },
      {
        property: "og:description",
        content: "مقارنة النطاق المبدئي بالنطاق النهائي قبل بدء المراجعة.",
      },
    ],
  }),
  component: ScopeConfirmPage,
});

function ScopeConfirmPage() {
  const { caseId } = Route.useParams();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [current, setCurrent] = useState<ReviewScopeSnapshot | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<ReviewScopeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoGenRef = useRef(false);

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    setCurrent(svc.latestScope(caseId));
    setLastConfirmed(svc.lastConfirmedScope(caseId));
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  // The scope snapshot is fully deterministic, so generating it is not a
  // decision the reviewer needs to make. Generate it once automatically and
  // leave the human with a single explicit act: confirming it.
  useEffect(() => {
    if (autoGenRef.current) return;
    if (!c || c.status === "closed") return;
    if (current && !c.scopeNeedsReconfirmation) return;
    if (c.status !== "minimum_inputs_complete" && c.status !== "scope_confirmed") return;
    autoGenRef.current = true;
    try {
      new CaseService().generateScope(caseId);
      void refresh();
    } catch {
      // Surfaced by the explicit generate button below.
    }
  }, [c, current, caseId]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </AppShell>
    );
  }

  const svc = new CaseService();
  const readOnly = c.status === "closed";

  // Provisional (live) scope from the currently registered inputs.
  const activeInputs: ReviewInputType[] = [];
  if (c.ageYears !== null || c.phaseId !== null) activeInputs.push("age_phase");
  const sources = svc.sourcesFor(caseId);
  for (const s of sources) {
    if (s.status !== "ready_for_future_ingestion") continue;
    if (s.type === "plan") activeInputs.push("plan");
    else activeInputs.push(s.type as ReviewInputType);
  }
  const provisional = computeProvisionalScope(activeInputs, c.phaseId);
  const provisionalCounts = countScopeBuckets(provisional);
  const confirmedCounts = current
    ? {
        available: current.availableDomains.length,
        notReviewable: current.notReviewableDomains.length,
        notApplicable: current.notApplicableDomains.length,
      }
    : null;

  const doGenerate = () => {
    if (readOnly || busy) return;
    setError(null);
    setBusy(true);
    try {
      svc.generateScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = () => {
    if (readOnly || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (c.scopeNeedsReconfirmation) svc.reconfirmScope(caseId);
      else svc.confirmScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canGenerate =
    !readOnly &&
    (c.status === "minimum_inputs_complete" || c.status === "scope_confirmed");
  const canConfirm = !readOnly && !!current;

  return (
    <WorkflowShell caseId={caseId} currentStep="scope" width="regular">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="تأكيد نطاق المراجعة"
        stepIndicatorAr="الخطوة 5 من 8"
        descriptionAr="مقارنة النطاق المبدئي المستنتج من المصادر بالنطاق النهائي الذي ستُبنى عليه المراجعة."
        requiredNowAr={
          c.scopeNeedsReconfirmation
            ? "تغيّرت المصادر — أعد تأكيد النطاق قبل المتابعة."
            : "ولّد النطاق ثم أكّده لبدء مساحة المراجعة."
        }
        statusLabelAr={c.scopeNeedsReconfirmation ? "بحاجة إلى تأكيد" : "متزامن"}
        statusVariant={c.scopeNeedsReconfirmation ? "attention" : "info"}
        trailing={
          <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
            العودة إلى ملخص الحالة
          </Link>
        }
      />

      <section
        className="mb-6 rounded-md border border-border bg-muted/30 p-4"
        data-testid="scope-provisional"
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">النطاق المبدئي (من المصادر الحالية)</h2>
          <StatusBadge variant="info">تقديري</StatusBadge>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold">{provisionalCounts.available}</div>
            <div className="text-xs text-muted-foreground">قابلة للمراجعة</div>
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold">{provisionalCounts.notReviewable}</div>
            <div className="text-xs text-muted-foreground">غير قابلة للمراجعة</div>
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold">{provisionalCounts.notApplicable}</div>
            <div className="text-xs text-muted-foreground">غير منطبقة</div>
          </div>
        </div>
      </section>

      <section
        className="mb-6 rounded-md border border-border p-4"
        data-testid="scope-confirmed"
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">النطاق النهائي (المؤكَّد)</h2>
          {confirmedCounts ? (
            <StatusBadge variant={c.scopeNeedsReconfirmation ? "attention" : "success"}>
              {c.scopeNeedsReconfirmation ? "بحاجة إلى إعادة تأكيد" : "مؤكَّد"}
            </StatusBadge>
          ) : (
            <StatusBadge variant="neutral">لم يُولَّد بعد</StatusBadge>
          )}
        </div>
        {confirmedCounts ? (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border border-border bg-background p-3 text-center">
              <div className="text-2xl font-bold">{confirmedCounts.available}</div>
              <div className="text-xs text-muted-foreground">قابلة للمراجعة</div>
            </div>
            <div className="rounded-md border border-border bg-background p-3 text-center">
              <div className="text-2xl font-bold">{confirmedCounts.notReviewable}</div>
              <div className="text-xs text-muted-foreground">غير قابلة للمراجعة</div>
            </div>
            <div className="rounded-md border border-border bg-background p-3 text-center">
              <div className="text-2xl font-bold">{confirmedCounts.notApplicable}</div>
              <div className="text-xs text-muted-foreground">غير منطبقة</div>
            </div>
          </div>
        ) : (
          <GateReason variant="warning">
            لم يُولَّد نطاق نهائي بعد. اضغط "توليد النطاق" لبدء المقارنة.
          </GateReason>
        )}
        {lastConfirmed && current && lastConfirmed.confirmedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            آخر تأكيد: {new Date(lastConfirmed.confirmedAt).toLocaleString("ar")}
          </p>
        )}
      </section>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="confirm-scope-button"
          onClick={doConfirm}
          disabled={!canConfirm || busy}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {c.scopeNeedsReconfirmation
            ? "إعادة تأكيد النطاق"
            : "تأكيد النطاق وفتح المراجعة"}
        </button>
        <button
          type="button"
          onClick={doGenerate}
          disabled={!canGenerate || busy}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          إعادة احتساب النطاق
        </button>
      </div>

      <StageFooter
        backHref={`/cases/${caseId}/extraction`}
        backLabelAr="السابق: استخراج الأدلة"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="الانتقال إلى مساحة المراجعة"
        continueHref={`/cases/${caseId}/review`}
        continueDisabled={
          !current || c.scopeNeedsReconfirmation || c.status !== "scope_confirmed"
        }
        continueDisabledReasonAr={
          !current
            ? "يجري احتساب النطاق…"
            : c.scopeNeedsReconfirmation
              ? "أعد تأكيد النطاق قبل فتح مساحة المراجعة."
              : c.status !== "scope_confirmed"
                ? "اضغط تأكيد النطاق أولًا."
                : undefined
        }
      />
    </WorkflowShell>
  );
}