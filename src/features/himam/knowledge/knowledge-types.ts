// Types for the read-only HIMAM knowledge assets.
// Package 1A only exposes descriptive types; no criterion is evaluated.
export type DomainId = "D0" | "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8";

export const ALL_DOMAINS: DomainId[] = ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];

export type ReviewInputType =
  | "age_phase"
  | "plan"
  | "assessment"
  | "family_priorities"
  | "student_preferences"
  | "supports"
  | "professional_notes"
  | "prior_plan"
  | "prior_progress";

export type ScopeItemStatus = "available" | "not_reviewable" | "not_applicable";

export interface CriterionRecord {
  criterionId: string;
  domainId: DomainId;
  nameAr: string;
  reviewLevel: string;
  criterionType: string;
  requiredInputs: string[];
  sourceIds: string[];
}

export interface CriteriaIndex {
  criteria: CriterionRecord[];
  byId: Map<string, CriterionRecord>;
  byDomain: Map<DomainId, CriterionRecord[]>;
}

export interface InputActivationRow {
  inputId: string;
  inputNameAr: string;
  isRequired: boolean;
  activatesCriteria: string[]; // expanded ids
  blockedVerdictsWhenAbsent: string;
  dataMinimizationRule: string;
}

export interface InputActivationMatrix {
  rows: InputActivationRow[];
  byInputId: Map<string, InputActivationRow>;
}

export type ReadinessVerdict = "GO" | "CONDITIONAL_GO" | "NO_GO";

export interface KnowledgeManifest {
  packageName: string;
  version: string;
  readiness: ReadinessVerdict;
  openIssues: string[];
}

export interface KnowledgeBundle {
  manifest: KnowledgeManifest;
  criteria: CriteriaIndex;
  inputActivation: InputActivationMatrix;
}
