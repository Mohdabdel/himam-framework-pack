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

// Package 1B.2 — where the case sits in the ingestion/extraction pipeline.
export type CaseExtractionStage =
  | "not_started"
  | "sources_registered"
  | "text_ready"
  | "extraction_in_progress"
  | "confirmation_required"
  | "extraction_confirmed"
  | "blocked";

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
  // Package 1B.2 pipeline stage — orthogonal to the scope/close status above.
  extractionStage: CaseExtractionStage;
  scopeNeedsReconfirmation: boolean;
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
  // Package 1B.2 — SHA-256 of the currently attached blob (if any). When the
  // blob is replaced by one with a different hash, all downstream artifacts,
  // chunks, and evidence bound to this source are invalidated.
  sourceHash: string | null;
  // Optional locale hint for the source (e.g. "ar", "en"). UI-only.
  languageHint: string | null;
  // A `text_unavailable` source only clears the pipeline once the reviewer
  // records what they did about it.
  unavailableResolution: SourceUnavailableResolution | null;
  // Optional manual free text captured on the sources screen (family
  // priorities, student preferences, etc.) that gets chunked with a
  // manual_text locator instead of a real file.
  manualTextArtifactId: string | null;
}

export type SourceUnavailableResolution =
  | "manual_evidence_added"
  | "source_replaced"
  | "source_excluded_with_reason";

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

// TextLocator addresses a chunk inside its source in a parser-specific way.
// exactQuote alone is not enough — reviewers need to jump back to the same
// spot in the original document.
export type TextLocator =
  | { kind: "pdf_page"; pageNumber: number }
  | { kind: "docx_paragraph"; paragraphIndex: number }
  | { kind: "text_lines"; lineStart: number; lineEnd: number }
  | { kind: "manual_text"; sectionId: string };

export interface TextArtifact {
  id: string;
  sourceId: string;
  reviewCaseId: string;
  byteSize: number;
  charCount: number;
  pageCount: number;
  storagePath: string;
  extractedAt: string;
  // Package 1B.2 — provenance stamps used to reuse artifacts when the same
  // blob is re-ingested and to invalidate them when it changes.
  sourceHash: string;
  fullTextHash: string;
  parserName: string;
  parserVersion: string;
  generatedAt: string;
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
  locator: TextLocator;
  textHash: string;
}

// Package 1B.2 evidence model — decoupled from review criteria. Binding
// evidence to a criterion happens in Package 1C; here we only tag WHAT the
// quote is (a plan goal, an assessment finding, an identity marker, …) so a
// reviewer can confirm or reject the extraction itself.
export type EvidenceType =
  | "plan_goal"
  | "baseline_statement"
  | "need_statement"
  | "assessment_finding"
  | "family_priority"
  | "student_preference"
  | "support"
  | "accommodation"
  | "progress_measure"
  | "decision_rule"
  | "professional_observation"
  | "prior_goal"
  | "prior_progress"
  | "identity_marker"
  | "other";

export type EvidenceReviewStatus =
  | "pending"
  | "confirmed"
  | "edited"
  | "rejected"
  | "invalidated";

export type EvidenceExtractionMethod = "manual" | "ai";

export type EvidenceConfidence = "high" | "medium" | "low" | "not_applicable";

export interface EvidenceProvenance {
  sourceId: string;
  sourceChunkId: string;
  modelName: string | null;
  promptId: string | null;
  temperature: number | null;
  timestamp: string;
}

export interface ExtractedEvidence {
  id: string;
  reviewCaseId: string;
  sourceId: string;
  sourceChunkId: string;
  extractionRunId: string | null;
  evidenceType: EvidenceType;
  exactQuote: string;
  normalizedText: string;
  locator: TextLocator;
  sourceHash: string;
  extractionMethod: EvidenceExtractionMethod;
  confidence: EvidenceConfidence;
  status: EvidenceReviewStatus;
  createdAt: string;
  updatedAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rejectedReason: string | null;
  provenance: EvidenceProvenance;
}

// Package 1B.2 — an ExtractionRun records ONE round of AI extraction over a
// selected set of chunks. It never stores the raw text.
export type ExtractionRunStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "safe_stopped";

export interface ExtractionRun {
  id: string;
  reviewCaseId: string;
  sourceIds: string[];
  sourceHashes: string[];
  providerId: string;
  modelName: string | null;
  promptId: string;
  temperature: number | null;
  status: ExtractionRunStatus;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputChunkIds: string[];
  createdEvidenceIds: string[];
}

// Identity-marker cross-check across a single case's confirmed/edited
// evidence. Comparisons never span cases.
export type IdentityIntegrityStatus =
  | "not_checked"
  | "consistent"
  | "needs_confirmation"
  | "conflicting"
  | "acknowledged";

export interface IdentityIntegrityCheck {
  reviewCaseId: string;
  evidenceIds: string[];
  status: IdentityIntegrityStatus;
  message: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  updatedAt: string;
}

// Kept for repository migration only. Never exported publicly.
export interface LegacyEvidenceCandidate {
  id: string;
  reviewCaseId: string;
  sourceId: string;
  chunkId: string;
  criterionId?: string;
  domainId?: string;
  quote: string;
  origin: "manual" | "ai";
  status: "proposed" | "confirmed" | "rejected";
  confidence: number | null;
  provenance: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string | null;
}
