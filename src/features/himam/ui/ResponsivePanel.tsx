import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface ResponsivePanelProps {
  open: boolean;
  titleAr: string;
  descriptionAr?: string;
  // When true, closing asks for confirmation before discarding.
  dirty?: boolean;
  // Called once the panel is allowed to close (dirty state already resolved).
  onClose: () => void;
  // Element focus is returned to after close (the button that opened the panel).
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  "data-testid"?: string;
}

const DIRTY_WARNING_AR =
  "لديك تغييرات غير محفوظة في هذه اللوحة. إذا أغلقتها الآن ستفقد ما أدخلته.";

// One shared panel used across every HIMAM stage.
// Desktop: side drawer. Mobile (<768px): bottom sheet.
// Handles Escape, unsaved-changes confirmation, and focus return.
export function ResponsivePanel({
  open,
  titleAr,
  descriptionAr,
  dirty = false,
  onClose,
  returnFocusTo,
  children,
  footer,
  ...rest
}: ResponsivePanelProps) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descId = useId();

  const finishClose = useCallback(() => {
    setConfirming(false);
    onClose();
    const target = returnFocusTo?.current;
    if (target) window.setTimeout(() => target.focus(), 0);
  }, [onClose, returnFocusTo]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirming(true);
      return;
    }
    finishClose();
  }, [dirty, finishClose]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the panel so keyboard users land inside it.
    const first = panelRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], button, [href], input, select, textarea",
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="responsive-panel-root">
      <div
        className="absolute inset-0 bg-foreground/30"
        aria-hidden="true"
        onClick={requestClose}
        data-testid="responsive-panel-overlay"
      />
      <div
        ref={panelRef}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionAr ? descId : undefined}
        data-panel-mode={isMobile ? "bottom-sheet" : "drawer"}
        className={cn(
          "absolute flex max-h-full flex-col overflow-hidden border-border bg-background shadow-lg",
          isMobile
            ? "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t"
            : "inset-y-0 start-0 w-full max-w-md border-e",
        )}
        {...rest}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {titleAr}
            </h2>
            {descriptionAr && (
              <p id={descId} className="mt-0.5 text-xs text-muted-foreground">
                {descriptionAr}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            data-testid="panel-close"
            className="shrink-0 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            إغلاق
          </button>
        </div>

        {confirming && (
          <div
            role="alertdialog"
            aria-live="assertive"
            data-testid="panel-dirty-warning"
            className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
          >
            <p>{DIRTY_WARNING_AR}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="panel-discard-confirm"
                onClick={finishClose}
                className="rounded-md border border-amber-300 bg-background px-2 py-1"
              >
                تجاهل التغييرات وإغلاق
              </button>
              <button
                type="button"
                data-testid="panel-keep-editing"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-input bg-background px-2 py-1"
              >
                متابعة التحرير
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
