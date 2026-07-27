export { CaseService } from "./cases/case-service";
export { createInMemoryRepository, getDefaultRepository } from "./cases/case-repository";
export type { ReviewCaseRepository } from "./cases/case-repository";
export * from "./cases/case-types";
export {
  resolveCaseNextAction,
  caseGateReasonAr,
  CASE_GATE_REASONS_AR,
} from "./cases/case-next-action";
export type { CaseNextAction, CaseNextActionKind } from "./cases/case-next-action";
export { getReviewScope } from "./scope/scope-service";
export type {
  ScopeResult,
  CriterionScopeItem,
  CriterionReasonCode,
  ReviewScopeContext,
} from "./scope/scope-service";
export {
  INPUT_IMPACTS,
  describeInputImpact,
  describeInputAbsenceForReport,
  PROVISIONAL_SCOPE_DISCLAIMER_AR,
  computeProvisionalScope,
  countScopeBuckets,
  expandableSources,
  JOURNEY_STEPS,
  JOURNEY_STATE_LABELS_AR,
  computeJourneyStatuses,
} from "./scope/input-impact";
export type {
  InputImpact,
  InputImpactKey,
  InputRequirement,
  ScopeBucketCounts,
  JourneyStepId,
  JourneyStepState,
  JourneyStepDef,
  JourneyContext,
  JourneyStepStatus,
} from "./scope/input-impact";
export {
  InMemoryPlanFileStorage,
  IndexedDbPlanFileStorage,
  getDefaultPlanFileStorage,
  planStoragePath,
  textArtifactPath,
  PLAN_FILE_STORE,
  TEXT_ARTIFACT_STORE,
} from "./sources/plan-file-storage";
export type { PlanFileStorage, SourceArtifactStorage } from "./sources/plan-file-storage";
export { IngestionService } from "./ingestion/ingestion-service";
export type { IngestionResult } from "./ingestion/ingestion-service";
export { DefaultDocumentTextExtractor, guessDocumentKind } from "./ingestion/text-parsers";
export type {
  DocumentTextExtractor,
  ExtractionOutcome,
  DocumentKind,
  PdfPageExtractor,
  DocxTextExtractor,
} from "./ingestion/text-parsers";
export { buildChunks } from "./ingestion/text-chunker";
export type { PageInput } from "./ingestion/text-chunker";
export { sha256Hex } from "./ingestion/hash";
export { EvidenceService } from "./evidence/evidence-service";
export type { CreateManualEvidenceInput, AiEvidenceDraft } from "./evidence/evidence-service";
export { ALLOWED_EVIDENCE_TYPES, isEvidenceTypeAllowed } from "./evidence/evidence-service";
export {
  loadCriteriaIndex,
  loadInputActivationMatrix,
  loadKnowledgeBundle,
  loadKnowledgeManifest,
} from "./knowledge/knowledge-loader";
export { validateKnowledgeBundle } from "./knowledge/knowledge-validation";
export { getKnowledgePackageVersion } from "./knowledge/knowledge-version";
export * from "./knowledge/knowledge-types";
export { validatePlanFile } from "./sources/source-service";
export { canTransition, applyTransition } from "./cases/case-state-machine";
export type { AuditEvent } from "./audit/audit-types";
export {
  PHASE_LABELS_AR,
  phaseLabelAr,
  STATUS_LABELS_AR,
  statusLabelAr,
  STATUS_BADGE_CLASSES,
  formatArabicDate,
  detectPhaseAgeInconsistency,
  shortCaseId,
  SOURCE_TYPE_LABELS_AR,
  SOURCE_TYPES_ORDER,
  SINGLE_ACTIVE_SOURCE_TYPES,
  MANUAL_TEXT_SOURCE_TYPES,
  EVIDENCE_TYPE_LABELS_AR,
  EVIDENCE_STATUS_LABELS_AR,
  EXTRACTION_STAGE_LABELS_AR,
  CASE_STAGE_LABELS_AR,
} from "./cases/case-labels";
export * from "./extraction";
export * from "./review";
export * from "./ui";
