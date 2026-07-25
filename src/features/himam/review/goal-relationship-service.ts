import type { ReviewCaseRepository } from "../cases/case-repository";

export type GoalRelation =
  | "builds_on"
  | "prepares_for"
  | "integrates_with"
  | "generalizes_to"
  | "increases_independence_in"
  | "duplicates"
  | "conflicts_with"
  | "unlinked";

export interface GoalNode {
  goalEvidenceId: string;
  text: string;
}

export interface GoalRelationEdge {
  from: string;
  to: string;
  relation: GoalRelation;
  isDeterministic: boolean;
}

export class GoalRelationshipService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  // Deterministic-only: we do not infer duplicates or conflicts from
  // lexical similarity. Every goal is emitted as `unlinked` unless the
  // reviewer manually asserts a relation (future). This keeps the graph
  // honest.
  buildGraph(caseId: string): { nodes: GoalNode[]; edges: GoalRelationEdge[] } {
    const store = this.repo.load();
    const goals = store.extractedEvidence.filter(
      (e) =>
        e.reviewCaseId === caseId &&
        e.evidenceType === "plan_goal" &&
        (e.status === "confirmed" || e.status === "edited"),
    );
    return {
      nodes: goals.map((g) => ({ goalEvidenceId: g.id, text: g.normalizedText })),
      edges: [],
    };
  }
}