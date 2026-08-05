import { Link, Navigate } from "@tanstack/react-router";
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

// The journey is progressive disclosure: identity is always visible, while
// the complete stage map stays closed until the user explicitly requests it.
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

        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => setStepsOpen((o) => !o)}
            aria-expanded={stepsOpen}
            aria-controls="workflow-steps-list"
            className="min-h-11 inline-flex items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            data-testid="workflow-steps-toggle"
          >
            <span>{stepsOpen ? "إخفاء مراحل المراجعة" : "إظهار مراحل المراجعة"}</span>
            <span aria-hidden>{stepsOpen ? "⌃" : "⌄"}</span>
          </button>
          {stepsOpen && (
            <ol
              id="workflow-steps-list"
              className="mt-2 flex flex-wrap items-center gap-1.5"
              data-testid="workflow-steps-list"
              aria-label="مسار المراجعة — 8 خطوات"
            >
              {JOURNEY_STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <StepIndicator
                    stepId={s.id}
                    labelAr={`${i + 1}. ${s.labelAr}`}
                    active={i === index}
                    status={statuses[i]}
                    hintAr={s.id === nextAction?.stepId ? nextAction.stateSummaryAr : undefined}
                  />
                  {i < JOURNEY_STEPS.length - 1 && (
                    <span aria-hidden className="text-muted-foreground/50">
                      ‹
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {locked ? <Navigate to={target} params={{ caseId }} replace /> : children}
    </AppShell>
  );
}

function StepIndicator({
  stepId,
  labelAr,
  active,
  status,
  hintAr,
}: {
  stepId: JourneyStepId;
  labelAr: string;
  active: boolean;
  status?: JourneyStepStatus;
  hintAr?: string;
}) {
  const locked = isLocked(status);
  const base = cn(
    "min-h-11 inline-flex items-center gap-2 rounded-md border px-2.5 text-xs",
    active
      ? "border-primary bg-primary/10 font-semibold text-foreground"
      : locked
        ? "border-border/60 bg-muted/40 text-muted-foreground"
        : "border-border bg-background text-foreground",
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
  return (
    <span
      className={base}
      aria-disabled={locked || undefined}
      aria-current={active ? "step" : undefined}
      data-step-id={stepId}
      data-step-state={status?.state}
      title={hintAr}
    >
      {inner}
    </span>
  );
}
