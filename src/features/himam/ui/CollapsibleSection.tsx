import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface CollapsibleSectionProps {
  titleAr: string;
  hintAr?: string;
  defaultOpen?: boolean;
  // In print mode every collapsible section is expanded.
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

// Accessible show/hide section (aria-expanded + aria-controls),
// always expanded when printing via the `print:block` content rule.
export function CollapsibleSection({
  titleAr,
  hintAr,
  defaultOpen = false,
  children,
  className,
  ...rest
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section
      className={cn("rounded-md border border-border bg-background", className)}
      {...rest}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="no-print flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
      >
        <span className="text-sm font-semibold">{titleAr}</span>
        <span className="text-xs text-muted-foreground">
          {open ? "إخفاء" : "عرض"}
          {hintAr ? ` — ${hintAr}` : ""}
        </span>
      </button>
      <div
        id={panelId}
        className={cn("px-4 pb-4", open ? "block" : "hidden print:block")}
      >
        {children}
      </div>
    </section>
  );
}
