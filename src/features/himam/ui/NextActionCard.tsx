import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { CaseNextAction } from "../cases/case-next-action";
import { NEXT_ACTION_VARIANT, variantClasses } from "./status-variants";
import { GateReason } from "./GateReason";

export interface NextActionCardProps {
  action: CaseNextAction;
  caseId: string;
  className?: string;
}

// Hero card at the top of the case center. The only place a
// "next action" is expressed. Reads its label + href from the resolver.
export function NextActionCard({ action, caseId, className }: NextActionCardProps) {
  const variant = NEXT_ACTION_VARIANT[action.kind];
  const disabled = !action.ctaEnabled || !action.ctaHref;
  return (
    <section
      className={cn("rounded-lg border p-4 shadow-sm", variantClasses(variant), className)}
      data-testid="case-next-action"
      data-next-action-kind={action.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            الخطوة التالية
          </div>
          <div className="mt-0.5 text-base font-semibold" data-testid="case-next-action-summary">
            {action.stateSummaryAr}
          </div>
        </div>
        {disabled ? (
          <button
            type="button"
            disabled
            className="rounded-md border border-input bg-background px-4 py-2 text-sm text-muted-foreground opacity-60"
            data-testid="case-next-action-cta"
          >
            {action.ctaLabelAr}
          </button>
        ) : (
          <Link
            to={action.ctaHref!}
            params={{ caseId }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="case-next-action-cta"
          >
            {action.ctaLabelAr}
          </Link>
        )}
      </div>
      {action.blockedReasonAr && (
        <GateReason
          variant="attention"
          className="mt-3 bg-background/60"
          data-testid="case-next-action-blocker"
        >
          {action.blockedReasonAr}
        </GateReason>
      )}
    </section>
  );
}
