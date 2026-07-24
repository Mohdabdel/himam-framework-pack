import { loadKnowledgeBundle } from "../knowledge/knowledge-loader";
import type { DomainId, ReviewInputType, ScopeItemStatus } from "../knowledge/knowledge-types";
import { ALL_DOMAINS } from "../knowledge/knowledge-types";

export interface ScopeResult {
  availableDomains: DomainId[];
  notReviewableDomains: DomainId[];
  notApplicableDomains: DomainId[];
  perDomain: Record<DomainId, ScopeItemStatus>;
  inputTypes: ReviewInputType[];
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

export function getReviewScope(inputs: ReviewInputType[]): ScopeResult {
  const bundle = loadKnowledgeBundle();
  const supplied = new Set(inputs);
  const activatedCriteria = new Set<string>();
  for (const t of supplied) {
    const key = INPUT_ID_MAP[t];
    const row = bundle.inputActivation.byInputId.get(key);
    if (!row) continue;
    for (const c of row.activatesCriteria) activatedCriteria.add(c);
  }
  const perDomain = {} as Record<DomainId, ScopeItemStatus>;
  const available: DomainId[] = [];
  const notReviewable: DomainId[] = [];
  for (const d of ALL_DOMAINS) {
    const domainCriteria = bundle.criteria.byDomain.get(d) ?? [];
    const hasActivated = domainCriteria.some((c) => activatedCriteria.has(c.criterionId));
    if (hasActivated) {
      perDomain[d] = "available";
      available.push(d);
    } else {
      perDomain[d] = "not_reviewable";
      notReviewable.push(d);
    }
  }
  return {
    availableDomains: available,
    notReviewableDomains: notReviewable,
    notApplicableDomains: [],
    perDomain,
    inputTypes: inputs,
  };
}
