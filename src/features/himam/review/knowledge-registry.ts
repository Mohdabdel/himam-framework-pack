// Central typed adapter over the knowledge bundle. All engine and UI code
// must go through this — never through direct CSV parsing or through
// scattered constants inside components.

import { loadKnowledgeBundle } from "../knowledge/knowledge-loader";
import type { CriterionRecord, KnowledgeBundle } from "../knowledge/knowledge-types";

export class KnowledgeRegistry {
  private readonly bundle: KnowledgeBundle;
  constructor(bundle?: KnowledgeBundle) {
    this.bundle = bundle ?? loadKnowledgeBundle();
  }
  criterion(id: string): CriterionRecord | null {
    return this.bundle.criteria.byId.get(id) ?? null;
  }
  allCriteria(): CriterionRecord[] {
    return this.bundle.criteria.criteria;
  }
  packageVersion(): string {
    return this.bundle.manifest.version;
  }
  bundleRef(): KnowledgeBundle {
    return this.bundle;
  }
}

let cached: KnowledgeRegistry | null = null;
export function getKnowledgeRegistry(): KnowledgeRegistry {
  cached ??= new KnowledgeRegistry();
  return cached;
}
