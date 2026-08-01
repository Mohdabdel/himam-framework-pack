import type { ReviewCaseRepository } from "../cases/case-repository";
import type { ReviewCoverage, ReviewFinding } from "./review-types";

export class ReviewCoverageService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  compute(caseId: string, versionId?: string): ReviewCoverage {
    const store = this.repo.load();
    const findings = store.reviewFindings.filter(
      (f) =>
        f.caseId === caseId && !f.isStale && (versionId ? f.reviewVersionId === versionId : true),
    );
    return summarize(findings);
  }
}

function summarize(findings: ReviewFinding[]): ReviewCoverage {
  let active = 0,
    reviewed = 0,
    notReviewable = 0,
    notApplicable = 0,
    pending = 0,
    accepted = 0,
    modified = 0,
    rejected = 0,
    deferred = 0,
    requested = 0;
  for (const f of findings) {
    if (f.automatedStatus === "not_applicable") {
      notApplicable++;
      continue;
    }
    if (f.automatedStatus === "not_reviewable") {
      notReviewable++;
      continue;
    }
    active++;
    if (f.humanReviewStatus === "pending") pending++;
    else reviewed++;
    switch (f.humanDecision) {
      case "accept":
        accepted++;
        break;
      case "modify":
        modified++;
        break;
      case "reject":
        rejected++;
        break;
      case "defer":
        deferred++;
        break;
      case "request_more_information":
        requested++;
        break;
      default:
        break;
    }
  }
  return {
    activeCriteriaCount: active,
    reviewedCriteriaCount: reviewed,
    notReviewableCount: notReviewable,
    notApplicableCount: notApplicable,
    pendingHumanDecisionCount: pending,
    acceptedCount: accepted,
    modifiedCount: modified,
    rejectedCount: rejected,
    deferredCount: deferred,
    requestedInfoCount: requested,
  };
}
