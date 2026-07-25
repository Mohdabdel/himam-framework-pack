export { CaseService } from "./cases/case-service";
export { createInMemoryRepository, getDefaultRepository } from "./cases/case-repository";
export type { ReviewCaseRepository } from "./cases/case-repository";
export * from "./cases/case-types";
export { getReviewScope } from "./scope/scope-service";
export type {
  ScopeResult,
  CriterionScopeItem,
  CriterionReasonCode,
  ReviewScopeContext,
} from "./scope/scope-service";
export {
  InMemoryPlanFileStorage,
  IndexedDbPlanFileStorage,
  getDefaultPlanFileStorage,
  planStoragePath,
  PLAN_FILE_STORE,
} from "./sources/plan-file-storage";
export type { PlanFileStorage } from "./sources/plan-file-storage";
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
} from "./cases/case-labels";
