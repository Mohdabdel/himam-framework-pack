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

// Package 1B stage. `not_started` is the default for freshly registered
// sources. `text_extracted` means an artifact + chunks exist. `text_unavailable`
// covers scanned/empty documents (no image recognition is attempted). `failed` covers hard
// errors that are worth surfacing but should not corrupt case state.
export type ExtractionStage =
  | "not_started"
  | "text_extracted"
  | "text_unavailable"
  | "failed";

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
  extractionStage: ExtractionStage;
}

export interface ReviewScopeSnapshot {
  id: string;
  reviewCaseId: string;
  knowledgePackageVersion: string;
  availableDomains: string[];
  notReviewableDomains: string[];
  notApplicableDomains: string[];
  inputTypes: string[];
  criterionScope: {
    criterionId: string;
    domainId: string;
    status: "available" | "not_reviewable" | "not_applicable";
    reasonCode:
      | "inputs_available"
      | "missing_required_input"
      | "phase_not_applicable"
      | "conditional_requirement_not_triggered";
  }[];
  confirmedAt: string | null;
  createdAt: string;
}

// Package 1B artifacts ----------------------------------------------------

export interface TextArtifact {
  id: string;
  sourceId: string;
  reviewCaseId: string;
  byteSize: number;
  charCount: number;
  pageCount: number;
  storagePath: string;
  extractedAt: string;
}

export interface TextChunk {
  chunkId: string;
  sourceId: string;
  artifactId: string;
  order: number;
  text: string;
  charOffsetStart: number;
  charOffsetEnd: number;
  pageNumber: number | null;
}

export type EvidenceStatus = "proposed" | "confirmed" | "rejected";
export type EvidenceOrigin = "manual" | "ai";

export interface EvidenceCandidate {
  id: string;
  reviewCaseId: string;
  sourceId: string;
  chunkId: string;
  criterionId: string;
  domainId: string;
  quote: string;
  origin: EvidenceOrigin;
  status: EvidenceStatus;
  confidence: number | null;
  provenance: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string | null;
}
