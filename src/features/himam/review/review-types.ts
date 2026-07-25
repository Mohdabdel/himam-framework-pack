// Package 1C — deterministic review model. Kept isolated from Package 1B
// evidence types so 1C changes do not force schema migrations upstream.

import type { DomainId } from "../knowledge/knowledge-types";

// The six status values are the ONLY values a Finding may carry. UI labels
// are supplied by review-labels.ts.
export type FindingStatus =
  | "achieved"
  | "partially_achieved"
  | "not_achieved"
  | "needs_clarification"
  | "not_reviewable"
  | "not_applicable";

// Severity is orthogonal to status. Human severity may differ from
// automated severity; both are stored.
export type FindingSeverity =
  | "action_required_before_goal_approval"
  | "major_plan_gap"
  | "quality_improvement"
  | "guidance_note"
  | "no_judgment";

export type HumanReviewStatus = "pending" | "decided";

export type HumanDecision =
  | "accept"
  | "modify"
  | "reject"
  | "request_more_information"
  | "defer";

// Why the engine activated this criterion for this case.
export type ActivationReason =
  | "inputs_available"
  | "phase_gate_passed"
  | "gatekeeper_check"
  | "integrity_check"
  | "conditional_triggered";

// What the engine can target with a Finding. In 1C we only target the case
// as a whole and individual plan goals (found via confirmed plan_goal
// evidence). Deeper targeting (per-support, per-domain-plan) is deferred.
export type FindingTargetType = "case" | "plan_goal" | "domain" | "plan";

export interface ReviewFinding {
  findingId: string;
  caseId: string;
  reviewVersionId: string;
  criterionId: string;
  domainId: DomainId;
  reviewLevel: string;
  targetType: FindingTargetType;
  targetId: string | null;
  evidenceIds: string[];
  sourceIds: string[];
  automatedStatus: FindingStatus;
  automatedSeverity: FindingSeverity;
  rationale: string;
  recommendation: string;
  limitations: string;
  uncertainty: "low" | "medium" | "high";
  activationReason: ActivationReason;
  createdAt: string;
  engineVersion: string;
  // Human review layer — automated fields above are never mutated.
  humanReviewStatus: HumanReviewStatus;
  humanDecision: HumanDecision | null;
  humanStatus: FindingStatus | null;
  humanSeverity: FindingSeverity | null;
  humanRationale: string | null;
  humanRecommendation: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  // Set to true when a newer version invalidates this finding.
  isStale: boolean;
}

// One row per engine execution. Older versions stay in the store to keep
// the audit trail intact.
export interface ReviewVersion {
  versionId: string;
  caseId: string;
  scopeSnapshotId: string;
  engineVersion: string;
  knowledgePackageVersion: string;
  createdAt: string;
  isStale: boolean;
  staleReason: string | null;
  completedAt: string | null; // set when the human review finishes
  completedBy: string | null;
  // Digest of confirmed/edited evidence IDs at engine run time. If this
  // set changes afterward, the version becomes stale.
  evidenceDigest: string;
}

export interface ReviewCoverage {
  activeCriteriaCount: number;
  reviewedCriteriaCount: number;
  notReviewableCount: number;
  notApplicableCount: number;
  pendingHumanDecisionCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  deferredCount: number;
  requestedInfoCount: number;
}

export const ENGINE_VERSION = "himam-deterministic-review/1.0.0";