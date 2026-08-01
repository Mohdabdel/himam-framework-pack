import { cn } from "@/lib/utils";
import { variantClasses, type StatusVariant } from "./status-variants";

export interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function StatusBadge({ variant, children, className, ...rest }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight",
        variantClasses(variant),
        className,
      )}
      data-himam-variant={variant}
      {...rest}
    >
      {children}
    </span>
  );
}
