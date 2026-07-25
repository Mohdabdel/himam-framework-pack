import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type { IdentityIntegrityCheck } from "../cases/case-types";

// Compares identity_marker evidence within one case. No biometrics, no
// cross-case links, and the service never claims one document is "correct".
export class IdentityIntegrityService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  recompute(reviewCaseId: string): IdentityIntegrityCheck {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === reviewCaseId);
    if (!c) throw new Error("Case not found");
    const markers = store.extractedEvidence.filter(
      (e) =>
        e.reviewCaseId === reviewCaseId &&
        e.evidenceType === "identity_marker" &&
        (e.status === "confirmed" || e.status === "edited"),
    );
    const now = new Date().toISOString();
    const existing = store.identityChecks.find((c) => c.reviewCaseId === reviewCaseId);
    let check: IdentityIntegrityCheck;
    if (existing) {
      check = existing;
    } else {
      check = {
        reviewCaseId,
        evidenceIds: [],
        status: "not_checked",
        message: null,
        acknowledgedBy: null,
        acknowledgedAt: null,
        updatedAt: now,
      };
      store.identityChecks.push(check);
    }
    check.evidenceIds = markers.map((m) => m.id);
    check.updatedAt = now;
    if (markers.length === 0) {
      check.status = "not_checked";
      check.message = null;
    } else {
      const normalized = new Set(
        markers.map((m) => m.normalizedText.replace(/\s+/g, " ").trim().toLowerCase()),
      );
      if (normalized.size === 1) {
        check.status = "consistent";
        check.message = null;
      } else if (check.status !== "acknowledged") {
        check.status = "conflicting";
        check.message = "identity_markers_disagree";
        store.auditEvents.push(
          newAuditEvent(reviewCaseId, "identity_conflict_detected", {
            markerCount: markers.length,
          }),
        );
      }
    }
    this.repo.save(store);
    return check;
  }

  acknowledgeIdentityConflict(
    reviewCaseId: string,
    actorId: string | null = null,
  ): IdentityIntegrityCheck {
    const store = this.repo.load();
    const check = store.identityChecks.find((c) => c.reviewCaseId === reviewCaseId);
    if (!check) throw new Error("No identity check to acknowledge");
    if (check.status !== "conflicting") {
      throw new Error("Identity check is not conflicting");
    }
    check.status = "acknowledged";
    check.acknowledgedBy = actorId;
    check.acknowledgedAt = new Date().toISOString();
    store.auditEvents.push(newAuditEvent(reviewCaseId, "identity_conflict_acknowledged", {}));
    this.repo.save(store);
    return check;
  }

  currentFor(reviewCaseId: string): IdentityIntegrityCheck | null {
    return this.repo.load().identityChecks.find((c) => c.reviewCaseId === reviewCaseId) ?? null;
  }
}
