import type { ReviewCaseStatus } from "./case-types";

export type CaseTransition = "complete_minimum_inputs" | "confirm_scope" | "close_case";

const TRANSITIONS: Record<CaseTransition, [ReviewCaseStatus, ReviewCaseStatus]> = {
  complete_minimum_inputs: ["draft", "minimum_inputs_complete"],
  confirm_scope: ["minimum_inputs_complete", "scope_confirmed"],
  close_case: ["scope_confirmed", "closed"],
};

export function canTransition(from: ReviewCaseStatus, transition: CaseTransition): boolean {
  return TRANSITIONS[transition][0] === from;
}

export function applyTransition(
  from: ReviewCaseStatus,
  transition: CaseTransition,
): ReviewCaseStatus {
  const [expected, next] = TRANSITIONS[transition];
  if (from !== expected) {
    throw new Error(`Illegal HIMAM case transition: cannot ${transition} from ${from}`);
  }
  return next;
}

export const CASE_STATE_ORDER: ReviewCaseStatus[] = [
  "draft",
  "minimum_inputs_complete",
  "scope_confirmed",
  "closed",
];
