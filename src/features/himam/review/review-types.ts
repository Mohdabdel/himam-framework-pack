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

export type HumanDecision = "accept" | "modify" | "reject" | "request_more_information" | "defer";

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
  // Package 1C.3 — when the reviewer decides `request_more_information`
  // (or otherwise wants the finding surfaced in the "needs clarification"
  // section), this flag controls inclusion in the final governed report.
  // Defaults to `true` for request_more_information; ignored otherwise.
  humanIncludeInReport?: boolean | null;
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

// ============================================================
// Package 1C.3 — Governed Report
// ============================================================

export const GOVERNED_REPORT_ENGINE_VERSION = "himam-governed-report/1.0.0";

export type ReportVersionStatus = "draft" | "finalized" | "superseded" | "stale";

export type ReportGateReason =
  | "case_not_found"
  | "no_review_version"
  | "review_not_completed"
  | "review_stale"
  | "scope_needs_reconfirmation"
  | "extraction_not_confirmed"
  | "identity_conflict_unresolved"
  | "critical_findings_pending"
  | "evidence_drift_detected"
  | "case_closed_read_only";

export type ReportGateResult = { ok: true } | { ok: false; reason: ReportGateReason };

// Human-readable provenance for one report item: which source the quote
// came from, where inside that source, and the literal quote itself.
// Report contract (file 10, §4): a finding with no provenance is excluded.
export interface ReportEvidenceRef {
  evidenceId: string;
  sourceId: string;
  sourceTypeLabelAr: string;
  sourceNameAr: string;
  locatorLabelAr: string;
  evidenceTypeLabelAr: string;
  quote: string;
}

export interface ReportFindingItem {
  findingId: string;
  criterionId: string;
  domainId: DomainId;
  reviewLevel: string;
  targetType: FindingTargetType;
  targetId: string | null;
  finalStatus: FindingStatus;
  finalSeverity: FindingSeverity;
  finalRationale: string;
  finalRecommendation: string;
  limitations: string;
  evidenceIds: string[];
  sourceIds: string[];
  provenance: ReportEvidenceRef[];
  activationReason: ActivationReason;
  humanDecision: HumanDecision;
  uncertainty: "low" | "medium" | "high";
}

export interface ExcludedFindingRecord {
  findingId: string;
  criterionId: string;
  reason: "rejected_by_reviewer" | "deferred" | "not_applicable" | "no_provenance";
}

// Deterministic executive summary. Every string is copied from an already
// approved finding — the summary never adds a new claim.
export interface ReportExecutiveSummary {
  actionRequiredCount: number;
  majorGapCount: number;
  qualityOpportunityCount: number;
  needsClarificationCount: number;
  notReviewableCount: number;
  actionRequiredHeadlinesAr: string[];
  majorGapHeadlinesAr: string[];
  qualityOpportunityHeadlinesAr: string[];
  limitsAr: string[];
}

export interface GovernedReportSections {
  executiveSummary: ReportExecutiveSummary;
  actionRequired: ReportFindingItem[];
  majorPlanGaps: ReportFindingItem[];
  qualityImprovements: ReportFindingItem[];
  guidanceNotes: ReportFindingItem[];
  needsClarificationItems: ReportFindingItem[];
  notReviewableItems: ReportFindingItem[];
  excludedFindings: ExcludedFindingRecord[];
  governanceStatement: string;
  limitations: string[];
}

export interface GovernedReportMetadata {
  caseReferenceCode: string;
  caseIdShort: string;
  phaseId: string | null;
  planType: string | null;
  generatedAt: string;
  generatedBy: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reviewVersionId: string;
  scopeSnapshotId: string;
  engineVersion: string;
  reportEngineVersion: string;
  knowledgePackageVersion: string;
}

export interface GovernedReportScopeSummary {
  availableDomains: string[];
  notReviewableDomains: string[];
  notApplicableDomains: string[];
  inputTypes: string[];
}

export interface GovernedReportCoverage {
  activeCriteriaCount: number;
  reviewedCriteriaCount: number;
  pendingHumanDecisionCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  deferredCount: number;
  requestedInfoCount: number;
  notReviewableCount: number;
  notApplicableCount: number;
}

export interface GovernedReportVersion {
  reportVersionId: string;
  caseId: string;
  reviewVersionId: string;
  versionNumber: number;
  status: ReportVersionStatus;
  createdAt: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  supersededAt: string | null;
  staleReason: string | null;
  metadata: GovernedReportMetadata;
  scopeSummary: GovernedReportScopeSummary;
  coverage: GovernedReportCoverage;
  sections: GovernedReportSections;
  // The report is a self-contained snapshot: any post-finalization change
  // in review findings never mutates these arrays. New reports supersede.
}

export interface ReportVersionDiff {
  addedFindings: string[]; // finding ids present in b but not a
  removedFindings: string[]; // finding ids present in a but not b
  changedFindings: {
    findingId: string;
    changes: string[]; // human-readable change tags
  }[];
  scopeChanges: string[];
  coverageDelta: Partial<Record<keyof GovernedReportCoverage, number>>;
}
