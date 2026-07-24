import { loadKnowledgeBundle } from "./knowledge-loader";
import { ALL_DOMAINS } from "./knowledge-types";

export function validateKnowledgeBundle(): { ok: true } {
  const bundle = loadKnowledgeBundle();
  const seen = new Set<string>();
  for (const c of bundle.criteria.criteria) {
    if (seen.has(c.criterionId)) {
      throw new Error(`Duplicate criterion id: ${c.criterionId}`);
    }
    seen.add(c.criterionId);
    if (!ALL_DOMAINS.includes(c.domainId)) {
      throw new Error(`Criterion ${c.criterionId} has invalid domain ${c.domainId}`);
    }
  }
  return { ok: true };
}
