import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type {
  FindingSeverity,
  FindingStatus,
  HumanDecision,
  ReviewFinding,
} from "./review-types";

export interface HumanReviewInput {
  findingId: string;
  decision: HumanDecision;
  humanStatus?: FindingStatus;
  humanSeverity?: FindingSeverity;
  humanRationale?: string;
  humanRecommendation?: string;
  actorId?: string | null;
}

export class HumanReviewService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  applyDecision(input: HumanReviewInput): ReviewFinding {
    const store = this.repo.load();
    const f = store.reviewFindings.find((x) => x.findingId === input.findingId);
    if (!f) throw new Error("Finding not found");
    if (f.isStale) throw new Error("Cannot decide a stale finding");
    const c = store.cases.find((x) => x.id === f.caseId);
    if (!c) throw new Error("Case not found");
    if (c.status === "closed") throw new Error("Case is closed");

    const now = new Date().toISOString();
    f.humanDecision = input.decision;
    f.humanReviewStatus = "decided";
    f.reviewedBy = input.actorId ?? null;
    f.reviewedAt = now;

    // Automated fields are NEVER mutated. Human fields are separate.
    if (input.decision === "accept") {
      f.humanStatus = f.automatedStatus;
      f.humanSeverity = f.automatedSeverity;
      f.humanRationale = input.humanRationale ?? null;
      f.humanRecommendation = input.humanRecommendation ?? null;
    } else if (input.decision === "modify") {
      f.humanStatus = input.humanStatus ?? f.automatedStatus;
      f.humanSeverity = input.humanSeverity ?? f.automatedSeverity;
      f.humanRationale = input.humanRationale ?? null;
      f.humanRecommendation = input.humanRecommendation ?? null;
    } else if (input.decision === "reject") {
      // Rejection excludes the finding from the final report body but keeps
      // the automated record for audit.
      f.humanStatus = null;
      f.humanSeverity = null;
      f.humanRationale = input.humanRationale ?? null;
      f.humanRecommendation = null;
    } else if (input.decision === "request_more_information") {
      f.humanStatus = "needs_clarification";
      f.humanSeverity = f.automatedSeverity;
      f.humanRationale = input.humanRationale ?? null;
      f.humanRecommendation = input.humanRecommendation ?? null;
    } else if (input.decision === "defer") {
      f.humanStatus = null;
      f.humanSeverity = null;
      f.humanRationale = input.humanRationale ?? null;
      f.humanRecommendation = null;
    }
    store.auditEvents.push(
      newAuditEvent(f.caseId, "finding_decided", {
        findingId: f.findingId,
        criterionId: f.criterionId,
        decision: input.decision,
        automatedStatus: f.automatedStatus,
        humanStatus: f.humanStatus,
      }),
    );
    this.repo.save(store);
    return f;
  }

  listForCase(caseId: string): ReviewFinding[] {
    return this.repo.load().reviewFindings.filter((f) => f.caseId === caseId);
  }
}