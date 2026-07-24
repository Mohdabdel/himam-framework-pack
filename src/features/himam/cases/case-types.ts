export type ReviewCaseStatus = "draft" | "minimum_inputs_complete" | "scope_confirmed" | "closed";

export const REVIEW_PHASES = [
  "early_intervention",
  "preschool",
  "elementary",
  "middle",
  "high_school",
  "adult_transition",
  "postsecondary_employment",
] as const;

export type ReviewPhaseId = (typeof REVIEW_PHASES)[number];

export interface ReviewCase {
  id: string;
  referenceCode: string;
  ageYears: number | null;
  phaseId: ReviewPhaseId | null;
  planType: string | null;
  status: ReviewCaseStatus;
  knowledgePackageVersion: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export type InputSourceType =
  | "plan"
  | "assessment"
  | "family_priorities"
  | "student_preferences"
  | "supports"
  | "professional_notes"
  | "prior_plan"
  | "prior_progress";

export type InputSourceStatus =
  | "registered"
  | "file_missing"
  | "unreadable"
  | "ready_for_future_ingestion";

export interface InputSource {
  id: string;
  reviewCaseId: string;
  type: InputSourceType;
  fileName: string;
  mimeType: string | null;
  storagePath: string | null;
  sourceDate: string | null;
  status: InputSourceStatus;
  createdAt: string;
}

export interface ReviewScopeSnapshot {
  id: string;
  reviewCaseId: string;
  knowledgePackageVersion: string;
  availableDomains: string[];
  notReviewableDomains: string[];
  notApplicableDomains: string[];
  inputTypes: string[];
  confirmedAt: string | null;
  createdAt: string;
}
