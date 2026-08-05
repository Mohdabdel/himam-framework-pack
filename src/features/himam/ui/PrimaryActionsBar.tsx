import { cn } from "@/lib/utils";

export interface PrimaryActionSpec {
  id: string;
  labelAr: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  // Short contextual note shown on hover/focus without adding page clutter.
  hintAr?: string;
  // Neutral Arabic sentence describing why the action is disabled.
  disabledReasonAr?: string;
  "data-testid"?: string;
}

export interface PrimaryActionsBarProps {
  actions: PrimaryActionSpec[];
  className?: string;
  align?: "start" | "end" | "between";
}

const VARIANT_CLASS: Record<NonNullable<PrimaryActionSpec["variant"]>, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
  secondary:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-60",
  ghost: "text-muted-foreground hover:text-foreground",
};

const ALIGN_CLASS: Record<NonNullable<PrimaryActionsBarProps["align"]>, string> = {
  start: "justify-start",
  end: "justify-end",
  between: "justify-between",
};

// Bottom-of-stage action bar. Every disabled button carries an
// Arabic explanation via title (native tooltip) + sibling GateReason
// text so the reason is discoverable both to sighted and screen-reader users.
export function PrimaryActionsBar({
  actions,
  className,
  align = "between",
}: PrimaryActionsBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur",
        ALIGN_CLASS[align],
        className,
      )}
      data-testid="primary-actions-bar"
    >
      {actions.map((a) => {
        const cls = cn(
          "inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
          VARIANT_CLASS[a.variant ?? "primary"],
          a.disabled && "cursor-not-allowed",
        );
        const testId = a["data-testid"] ?? `primary-action-${a.id}`;
        if (a.href && !a.disabled) {
          return (
            <a key={a.id} href={a.href} className={cls} data-testid={testId} title={a.hintAr}>
              {a.labelAr}
            </a>
          );
        }
        return (
          <button
            key={a.id}
            type="button"
            className={cls}
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.disabled ? a.disabledReasonAr : a.hintAr}
            aria-disabled={a.disabled}
            data-testid={testId}
            data-disabled-reason={a.disabled ? a.disabledReasonAr : undefined}
          >
            {a.labelAr}
          </button>
        );
      })}
    </div>
  );
}
