import { PrimaryActionsBar, type PrimaryActionSpec } from "./PrimaryActionsBar";

export interface StageFooterProps {
  // "السابق" / "العودة إلى حالة المراجعة" / etc.
  onBack?: () => void;
  backLabelAr?: string;
  backHref?: string;
  // Optional secondary return-to-case-center action.
  returnToCaseHref?: string;
  // "حفظ ومتابعة" style primary continuation.
  continueLabelAr: string;
  onContinue?: () => void;
  continueHref?: string;
  continueDisabled?: boolean;
  continueDisabledReasonAr?: string;
}

export function StageFooter({
  onBack,
  backLabelAr = "السابق",
  backHref,
  returnToCaseHref,
  continueLabelAr,
  onContinue,
  continueHref,
  continueDisabled,
  continueDisabledReasonAr,
}: StageFooterProps) {
  const actions: PrimaryActionSpec[] = [];
  if (onBack || backHref) {
    actions.push({
      id: "back",
      labelAr: backLabelAr,
      variant: "ghost",
      onClick: onBack,
      href: backHref,
    });
  }
  if (returnToCaseHref) {
    actions.push({
      id: "return-to-case",
      labelAr: "العودة إلى حالة المراجعة",
      variant: "secondary",
      href: returnToCaseHref,
    });
  }
  actions.push({
    id: "continue",
    labelAr: continueLabelAr,
    variant: "primary",
    onClick: onContinue,
    href: continueHref,
    disabled: continueDisabled,
    disabledReasonAr: continueDisabledReasonAr,
  });
  return <PrimaryActionsBar actions={actions} align="between" />;
}
