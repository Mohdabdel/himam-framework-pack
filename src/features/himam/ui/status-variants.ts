// Central variant map for HIMAM operational UI.
// Every screen must map its status-bearing widgets through this module,
// so labels and colors never drift.

import type { JourneyStepState } from "../scope/input-impact";
import type { CaseNextActionKind } from "../cases/case-next-action";
import type { ReviewCaseStatus } from "../cases/case-types";

export type StatusVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "attention"
  | "locked";

// Semantic classes referencing HIMAM design tokens declared in src/styles.css.
// Never hard-code colors in components — always route through variantClasses().
export const STATUS_VARIANT_CLASSES: Record<StatusVariant, string> = {
  neutral:
    "bg-muted text-muted-foreground border-border",
  info:
    "bg-himam-info-soft text-himam-info border-himam-info/30",
  success:
    "bg-himam-success-soft text-himam-success border-himam-success/30",
  warning:
    "bg-himam-warning-soft text-himam-warning-foreground border-himam-warning/40",
  attention:
    "bg-himam-attention-soft text-himam-attention border-himam-attention/40",
  locked:
    "bg-himam-locked-soft text-himam-locked-foreground border-himam-locked/30",
};

export function variantClasses(v: StatusVariant): string {
  return STATUS_VARIANT_CLASSES[v];
}

export const JOURNEY_STATE_VARIANT: Record<JourneyStepState, StatusVariant> = {
  not_started: "neutral",
  in_progress: "info",
  complete: "success",
  needs_action: "warning",
  needs_update: "attention",
  read_only: "locked",
};

export const CASE_STATUS_VARIANT: Record<ReviewCaseStatus, StatusVariant> = {
  draft: "neutral",
  minimum_inputs_complete: "warning",
  scope_confirmed: "success",
  closed: "locked",
};

// Next-action kinds group into three visual registers:
//   - closed/not_found → locked
//   - close_case (final act) → success (ready-to-finalize)
//   - everything else → info (a forward step)
export const NEXT_ACTION_VARIANT: Record<CaseNextActionKind, StatusVariant> = {
  open_basics: "info",
  attach_plan: "info",
  prepare_text: "info",
  confirm_evidence: "info",
  confirm_scope: "info",
  run_review: "info",
  complete_human_decisions: "warning",
  generate_report: "info",
  finalize_report: "warning",
  close_case: "success",
  case_closed: "locked",
  case_not_found: "locked",
};