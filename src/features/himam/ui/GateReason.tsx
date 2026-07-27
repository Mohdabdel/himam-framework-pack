import { cn } from "@/lib/utils";
import { variantClasses, type StatusVariant } from "./status-variants";

export interface GateReasonProps {
  // Neutral Arabic sentence explaining why an action is not yet reachable.
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
  "data-testid"?: string;
}

// Inline block used wherever the UI needs to explain a gate/blocker
// without failure language.
export function GateReason({
  children,
  variant = "warning",
  className,
  ...rest
}: GateReasonProps) {
  return (
    <div
      role="note"
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-relaxed",
        variantClasses(variant),
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}