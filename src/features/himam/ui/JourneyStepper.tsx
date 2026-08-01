import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  JOURNEY_STATE_LABELS_AR,
  type JourneyStepId,
  type JourneyStepStatus,
} from "../scope/input-impact";
import { StatusBadge } from "./StatusBadge";
import { JOURNEY_STATE_VARIANT } from "./status-variants";

export interface JourneyStepperProps {
  caseId: string;
  statuses: JourneyStepStatus[];
  // Route pattern per step id. Steps without an href render as read-only rows.
  stepHref?: Partial<Record<JourneyStepId, string>>;
  className?: string;
}

export function JourneyStepper({ caseId, statuses, stepHref, className }: JourneyStepperProps) {
  return (
    <ol className={cn("space-y-2", className)} data-testid="case-journey-stepper">
      {statuses.map((s, i) => {
        const href = stepHref?.[s.step.id];
        const openable = s.state !== "not_started" && !!href;
        const variant = JOURNEY_STATE_VARIANT[s.state];
        return (
          <li
            key={s.step.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card p-3"
            data-step-id={s.step.id}
            data-step-state={s.state}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{i + 1}.</span>
                <span className="text-sm font-medium">{s.step.labelAr}</span>
                <StatusBadge variant={variant}>{JOURNEY_STATE_LABELS_AR[s.state]}</StatusBadge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.step.descriptionAr}</div>
              {s.blockedReasonAr && (
                <div
                  className="mt-1 text-xs text-himam-warning-foreground"
                  data-testid={`step-blocker-${s.step.id}`}
                >
                  {s.blockedReasonAr}
                </div>
              )}
            </div>
            {href ? (
              openable ? (
                <Link
                  to={href}
                  params={{ caseId }}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
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
  );
}
