import { loadKnowledgeBundle } from "../knowledge/knowledge-loader";
import type { DomainId, ReviewInputType, ScopeItemStatus } from "../knowledge/knowledge-types";
import { ALL_DOMAINS } from "../knowledge/knowledge-types";
import type { ReviewPhaseId } from "../cases/case-types";
import { evaluatePhaseGate, ruleMatchesPhase } from "./phase-rules";

export type CriterionReasonCode =
  | "inputs_available"
  | "missing_required_input"
  | "phase_not_applicable"
  | "conditional_requirement_not_triggered";

export interface CriterionScopeItem {
  criterionId: string;
  domainId: DomainId;
  status: ScopeItemStatus;
  reasonCode: CriterionReasonCode;
}

export interface ReviewScopeContext {
  inputs: ReviewInputType[];
  phaseId: ReviewPhaseId | null;
}

export interface ScopeResult {
  availableDomains: DomainId[];
  notReviewableDomains: DomainId[];
  notApplicableDomains: DomainId[];
  perDomain: Record<DomainId, ScopeItemStatus>;
  inputTypes: ReviewInputType[];
  criterionScope: CriterionScopeItem[];
}

const INPUT_ID_MAP: Record<ReviewInputType, string> = {
  age_phase: "age",
  plan: "plan",
  assessment: "assessment",
  family_priorities: "family_priorities",
  student_preferences: "student_preference",
  supports: "supports",
  professional_notes: "professional_notes",
  prior_plan: "prior_plan",
  prior_progress: "prior_progress",
};

function normalize(input: ReviewInputType[] | ReviewScopeContext): ReviewScopeContext {
  if (Array.isArray(input)) return { inputs: input, phaseId: null };
  return input;
}

export function getReviewScope(input: ReviewInputType[] | ReviewScopeContext): ScopeResult {
  const ctx = normalize(input);
  const bundle = loadKnowledgeBundle();

  // Activation is driven by File 05 (input → criteria). Phase gating is
  // interpreted from File 03 rule columns via phase-rules.ts. Neither age
  // numeric thresholds nor domain-level phase logic are encoded here.
  const activated = new Set<string>();
  for (const t of ctx.inputs) {
    const key = INPUT_ID_MAP[t];
    const row = bundle.inputActivation.byInputId.get(key);
    if (!row) continue;
    for (const cid of row.activatesCriteria) activated.add(cid);
  }

  const items: CriterionScopeItem[] = [];
  for (const c of bundle.criteria.criteria) {
    if (!activated.has(c.criterionId)) {
      items.push({
        criterionId: c.criterionId,
        domainId: c.domainId,
        status: "not_reviewable",
        reasonCode: "missing_required_input",
      });
      continue;
    }
    if (ctx.phaseId) {
      if (c.notApplicableRule && ruleMatchesPhase(c.notApplicableRule, ctx.phaseId)) {
        items.push({
          criterionId: c.criterionId,
          domainId: c.domainId,
          status: "not_applicable",
          reasonCode: "phase_not_applicable",
        });
        continue;
      }
      if (c.activationRule && !evaluatePhaseGate(c.activationRule, ctx.phaseId)) {
        items.push({
          criterionId: c.criterionId,
          domainId: c.domainId,
          status: "not_applicable",
          reasonCode: "phase_not_applicable",
        });
        continue;
      }
    }
    items.push({
      criterionId: c.criterionId,
      domainId: c.domainId,
      status: "available",
      reasonCode: "inputs_available",
    });
  }

  const perDomain = {} as Record<DomainId, ScopeItemStatus>;
  const availableDomains: DomainId[] = [];
  const notReviewableDomains: DomainId[] = [];
  const notApplicableDomains: DomainId[] = [];
  for (const d of ALL_DOMAINS) {
    const list = items.filter((i) => i.domainId === d);
    if (list.length === 0) {
      perDomain[d] = "not_reviewable";
      notReviewableDomains.push(d);
      continue;
    }
    if (list.some((i) => i.status === "available")) {
      perDomain[d] = "available";
      availableDomains.push(d);
    } else if (list.every((i) => i.status === "not_applicable")) {
      perDomain[d] = "not_applicable";
      notApplicableDomains.push(d);
    } else {
      perDomain[d] = "not_reviewable";
      notReviewableDomains.push(d);
    }
  }

  return {
    availableDomains,
    notReviewableDomains,
    notApplicableDomains,
    perDomain,
    inputTypes: ctx.inputs,
    criterionScope: items,
  };
}
