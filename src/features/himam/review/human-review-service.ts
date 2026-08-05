import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import { isSystemClassificationStatus } from "./review-types";
import type { FindingSeverity, FindingStatus, HumanDecision, ReviewFinding } from "./review-types";

export interface HumanReviewInput {
  findingId: string;
  decision: HumanDecision;
  humanStatus?: FindingStatus;
  humanSeverity?: FindingSeverity;
  humanRationale?: string;
  humanRecommendation?: string;
  actorId?: string | null;
  // Package 1C.3 — controls surfacing in the report's needs-clarification
  // section for `request_more_information`. Defaults to true.
  includeInReport?: boolean;
}

export class HumanReviewService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  applyDecisions(inputs: HumanReviewInput[]): ReviewFinding[] {
    const store = this.repo.load();
    const decided: ReviewFinding[] = [];
    const now = new Date().toISOString();
    for (const input of inputs) {
      const f = store.reviewFindings.find((x) => x.findingId === input.findingId);
      if (!f) throw new Error("Finding not found");
      if (f.isStale) throw new Error("Cannot decide a stale finding");
      const c = store.cases.find((x) => x.id === f.caseId);
      if (!c) throw new Error("Case not found");
      if (c.status === "closed") throw new Error("Case is closed");

      f.humanDecision = input.decision;
      f.humanReviewStatus = "decided";
      f.reviewedBy = input.actorId ?? null;
      f.reviewedAt = now;
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
        f.humanStatus = null;
        f.humanSeverity = null;
        f.humanRationale = input.humanRationale ?? null;
        f.humanRecommendation = null;
      } else if (input.decision === "request_more_information") {
        f.humanStatus = "needs_clarification";
        f.humanSeverity = f.automatedSeverity;
        f.humanRationale = input.humanRationale ?? null;
        f.humanRecommendation = input.humanRecommendation ?? null;
        f.humanIncludeInReport = input.includeInReport ?? true;
      } else {
        f.humanStatus = null;
        f.humanSeverity = null;
        f.humanRationale = input.humanRationale ?? null;
        f.humanRecommendation = null;
        f.humanIncludeInReport = null;
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
      decided.push(f);
    }
    this.repo.save(store);
    return decided;
  }

  applyDecision(input: HumanReviewInput): ReviewFinding {
    return this.applyDecisions([input])[0];
  }

  /**
   * One explicit human acknowledgement for classifications produced by the
   * deterministic scope/review rules. The acknowledgement is stored on every
   * affected finding so no item can disappear from the governed report, and a
   * single aggregate audit event records the reviewer action.
   */
  acknowledgeSystemClassifications(
    caseId: string,
    versionId?: string,
    actorId: string | null = null,
  ): ReviewFinding[] {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    if (c.status === "closed") throw new Error("Case is closed");

    const candidates = store.reviewFindings.filter(
      (f) =>
        f.caseId === caseId &&
        !f.isStale &&
        (!versionId || f.reviewVersionId === versionId) &&
        f.humanReviewStatus === "pending" &&
        isSystemClassificationStatus(f.automatedStatus),
    );
    if (candidates.length === 0) return [];

    const now = new Date().toISOString();
    for (const f of candidates) {
      f.humanDecision = "accept";
      f.humanReviewStatus = "decided";
      f.humanStatus = f.automatedStatus;
      f.humanSeverity = f.automatedSeverity;
      f.humanRationale = null;
      f.humanRecommendation = null;
      f.reviewedBy = actorId;
      f.reviewedAt = now;
      store.auditEvents.push(
        newAuditEvent(caseId, "finding_decided", {
          findingId: f.findingId,
          criterionId: f.criterionId,
          decision: "accept",
          decisionMode: "system_classification_acknowledgement",
          automatedStatus: f.automatedStatus,
          humanStatus: f.humanStatus,
        }),
      );
    }
    store.auditEvents.push(
      newAuditEvent(caseId, "system_classifications_acknowledged", {
        versionId: versionId ?? candidates[0]?.reviewVersionId ?? null,
        count: candidates.length,
        notReviewableCount: candidates.filter((f) => f.automatedStatus === "not_reviewable").length,
        notApplicableCount: candidates.filter((f) => f.automatedStatus === "not_applicable").length,
      }),
    );
    this.repo.save(store);
    return candidates;
  }

  listForCase(caseId: string): ReviewFinding[] {
    return this.repo.load().reviewFindings.filter((f) => f.caseId === caseId);
  }
}
