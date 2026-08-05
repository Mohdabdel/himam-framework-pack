import type { ExtractedEvidence } from "../cases/case-types";
import type { ReviewFinding } from "./review-types";

// A goal finding is useful to a human reviewer only when its internal target
// still resolves to the exact, confirmed quote that came from this case.
// Never fall back to another goal or to generated text: a missing link must be
// visible as a missing link rather than silently attaching the wrong goal.
export function resolveFindingGoalEvidence(
  finding: ReviewFinding,
  evidenceById: ReadonlyMap<string, ExtractedEvidence>,
): ExtractedEvidence | null {
  if (finding.targetType !== "plan_goal" || !finding.targetId) return null;

  const evidence = evidenceById.get(finding.targetId);
  if (!evidence) return null;
  if (evidence.reviewCaseId !== finding.caseId) return null;
  if (evidence.evidenceType !== "plan_goal") return null;
  if (evidence.status !== "confirmed" && evidence.status !== "edited") return null;
  if (!finding.evidenceIds.includes(evidence.id)) return null;
  if (!evidence.exactQuote.trim()) return null;

  return evidence;
}
