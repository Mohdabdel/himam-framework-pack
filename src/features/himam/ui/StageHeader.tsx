import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { StatusVariant } from "./status-variants";

export interface StageHeaderProps {
  // Case reference code shown as small overline (e.g. "RC-2025-0007").
  caseCodeAr?: string;
  // Primary title of the stage screen. Always Arabic.
  titleAr: string;
  // One-sentence description explaining what happens on this stage.
  descriptionAr?: string;
  // "What is expected of the user right now" — surfaced as a highlighted line.
  requiredNowAr?: string;
  // "Stage N of 8" indicator (Arabic).
  stepIndicatorAr?: string;
  // Non-blocking status badge (e.g. save state, or gate state).
  statusLabelAr?: string;
  statusVariant?: StatusVariant;
  // Slot for a small action on the far-inline-end (e.g. "العودة").
  trailing?: React.ReactNode;
  className?: string;
}

export function StageHeader({
  caseCodeAr,
  titleAr,
  descriptionAr,
  requiredNowAr,
  stepIndicatorAr,
  statusLabelAr,
  statusVariant = "info",
  trailing,
  className,
}: StageHeaderProps) {
  return (
    <header
      className={cn("mb-6 border-b border-border pb-4", className)}
      data-testid="stage-header"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {(caseCodeAr || stepIndicatorAr) && (
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {caseCodeAr && <span data-testid="stage-header-code">{caseCodeAr}</span>}
              {caseCodeAr && stepIndicatorAr && <span aria-hidden>·</span>}
              {stepIndicatorAr && (
                <span data-testid="stage-header-step">{stepIndicatorAr}</span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold sm:text-2xl" data-testid="stage-header-title">
              {titleAr}
            </h1>
            {statusLabelAr && (
              <StatusBadge variant={statusVariant} data-testid="stage-header-status">
                {statusLabelAr}
              </StatusBadge>
            )}
          </div>
          {descriptionAr && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{descriptionAr}</p>
          )}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      {requiredNowAr && (
        <div
          className="mt-3 rounded-md border border-himam-info/30 bg-himam-info-soft px-3 py-2 text-sm text-himam-info"
          data-testid="stage-header-required-now"
        >
          <span className="font-medium">المطلوب الآن: </span>
          {requiredNowAr}
        </div>
      )}
    </header>
  );
}