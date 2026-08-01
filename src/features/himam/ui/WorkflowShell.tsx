import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppShell, type AppShellProps } from "./AppShell";
import { StatusBadge } from "./StatusBadge";
import { JOURNEY_STATE_VARIANT } from "./status-variants";
import {
  JOURNEY_STATE_LABELS_AR,
  JOURNEY_STEPS,
  type JourneyStepId,
  type JourneyStepStatus,
} from "../scope/input-impact";
import { phaseLabelAr } from "../cases/case-labels";
import { JOURNEY_STEP_HREF, journeyStepIndex, useCaseJourney } from "./use-case-journey";

export interface WorkflowShellProps {
  caseId: string;
  currentStep: JourneyStepId;
  width?: AppShellProps["width"];
  className?: string;
  // Short Arabic save-state line, e.g. "محفوظ في هذا المتصفح".
  saveStateAr?: string;
  // Set false for the case hub, which is always reachable.
  guard?: boolean;
  children: React.ReactNode;
}

function isLocked(s: JourneyStepStatus | undefined): boolean {
  return !s || s.state === "not_started";
}

// Compact 8-step indicator: horizontal chips on desktop, a single
// "الخطوة X من 8" line plus an expandable list on mobile.
export function WorkflowShell({
  caseId,
  currentStep,
  width = "regular",
  className,
  saveStateAr = "محفوظ في هذا المتصفح",
  guard = true,
  children,
}: WorkflowShellProps) {
  const { loading, reviewCase, statuses, nextAction } = useCaseJourney(caseId);
  const [stepsOpen, setStepsOpen] = useState(false);
  const index = journeyStepIndex(currentStep);
  const current = JOURNEY_STEPS[index];
  const currentStatus = statuses[index];
  const locked = guard && !loading && !!reviewCase && isLocked(currentStatus);

  const target = (() => {
    const href = nextAction?.ctaHref;
    return href && href !== JOURNEY_STEP_HREF[currentStep] ? href : "/cases/$caseId";
  })();

  return (
    <AppShell width={width} className={className}>
      <div className="mb-6 rounded-lg border border-border bg-card" data-testid="workflow-shell">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
              HIMAM — مراجعة الخطط التربوية
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold" data-testid="workflow-case-code">
                {reviewCase?.referenceCode ?? "—"}
              </span>
              <span className="text-muted-foreground">
                {reviewCase?.planType ? `${reviewCase.planType} · ` : ""}
                {phaseLabelAr(reviewCase?.phaseId ?? null)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground" data-testid="workflow-save-state">
              {saveStateAr}
            </span>
            <Link
              to="/cases"
              className="min-h-11 inline-flex items-center rounded-md border border-input px-3 text-xs hover:bg-accent"
              data-testid="workflow-back-to-cases"
            >
              قائمة الحالات
            </Link>
          </div>
        </div>

        {/* Mobile: compact current-step line + expandable list */}
        <div className="border-t border-border px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setStepsOpen((o) => !o)}
            aria-expanded={stepsOpen}
            className="min-h-11 flex w-full items-center justify-between gap-2 text-start"
            data-testid="workflow-steps-mobile"
          >
            <span className="text-sm font-medium">
              الخطوة {index + 1} من 8 — {current.labelAr}
            </span>
            <span className="text-xs text-muted-foreground">
              {stepsOpen ? "إخفاء الخطوات" : "عرض الخطوات"}
            </span>
          </button>
          {stepsOpen && (
            <ol className="mt-3 space-y-1.5" data-testid="workflow-steps-list">
              {JOURNEY_STEPS.map((s, i) => (
                <li key={s.id}>
                  <StepLink
                    caseId={caseId}
                    stepId={s.id}
                    labelAr={`${i + 1}. ${s.labelAr}`}
                    active={i === index}
                    status={statuses[i]}
                    block
                  />
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Desktop: horizontal compact chips */}
        <ol
          className="hidden flex-wrap items-center gap-1.5 border-t border-border px-4 py-2.5 md:flex"
          data-testid="workflow-steps-desktop"
          aria-label="مسار المراجعة — 8 خطوات"
        >
          {JOURNEY_STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <StepLink
                caseId={caseId}
                stepId={s.id}
                labelAr={`${i + 1}. ${s.labelAr}`}
                active={i === index}
                status={statuses[i]}
              />
              {i < JOURNEY_STEPS.length - 1 && (
                <span aria-hidden className="text-muted-foreground/50">
                  ‹
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {locked ? (
        <section
          className="rounded-lg border border-border bg-card p-6"
          data-testid="workflow-step-locked"
        >
          <h1 className="text-lg font-bold">هذه الخطوة غير متاحة بعد</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {currentStatus?.blockedReasonAr ?? "أكمل الخطوات السابقة للوصول إلى هذه الخطوة."}
          </p>
          <Link
            to={target}
            params={{ caseId }}
            className="mt-4 min-h-11 inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="workflow-goto-required-step"
          >
            {nextAction?.ctaLabelAr ?? "الانتقال إلى الخطوة المطلوبة"}
          </Link>
        </section>
      ) : (
        children
      )}
    </AppShell>
  );
}

function StepLink({
  caseId,
  stepId,
  labelAr,
  active,
  status,
  block,
}: {
  caseId: string;
  stepId: JourneyStepId;
  labelAr: string;
  active: boolean;
  status?: JourneyStepStatus;
  block?: boolean;
}) {
  const href = JOURNEY_STEP_HREF[stepId];
  const locked = isLocked(status);
  const base = cn(
    "min-h-11 inline-flex items-center gap-2 rounded-md border px-2.5 text-xs",
    block && "w-full justify-between",
    active
      ? "border-primary bg-primary/10 font-semibold text-foreground"
      : locked
        ? "border-border/60 bg-muted/40 text-muted-foreground"
        : "border-border bg-background hover:bg-accent",
  );
  const inner = (
    <>
      <span className="truncate">{labelAr}</span>
      {status && (
        <StatusBadge variant={JOURNEY_STATE_VARIANT[status.state]}>
          {JOURNEY_STATE_LABELS_AR[status.state]}
        </StatusBadge>
      )}
    </>
  );
  if (locked || !href || active) {
    return (
      <span
        className={base}
        aria-disabled={locked || undefined}
        aria-current={active ? "step" : undefined}
        data-step-id={stepId}
        data-step-state={status?.state}
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      to={href}
      params={{ caseId }}
      className={base}
      data-step-id={stepId}
      data-step-state={status?.state}
    >
      {inner}
    </Link>
  );
}
