import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import { DeterministicReviewEngine, computeEvidenceDigest } from "./deterministic-review-engine";
import { getKnowledgeRegistry } from "./knowledge-registry";
import {
  ENGINE_VERSION,
  isSystemClassificationStatus,
  type ReviewFinding,
  type ReviewVersion,
} from "./review-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type ReviewGateReason =
  | "case_not_found"
  | "case_closed_read_only"
  | "scope_not_confirmed"
  | "scope_needs_reconfirmation"
  | "extraction_not_confirmed"
  | "identity_conflict_unresolved"
  | "no_confirmed_evidence_and_no_not_reviewable";

export type ReviewGateResult = { ok: true } | { ok: false; reason: ReviewGateReason };

export class ReviewVersionService {
  private readonly engine: DeterministicReviewEngine;
  constructor(private readonly repo: ReviewCaseRepository) {
    this.engine = new DeterministicReviewEngine(repo);
  }

  canOpenReview(caseId: string): ReviewGateResult {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) return { ok: false, reason: "case_not_found" };
    if (c.status === "closed") return { ok: true }; // read-only allowed
    if (c.status !== "scope_confirmed") return { ok: false, reason: "scope_not_confirmed" };
    if (c.scopeNeedsReconfirmation) return { ok: false, reason: "scope_needs_reconfirmation" };
    if (c.extractionStage !== "extraction_confirmed")
      return { ok: false, reason: "extraction_not_confirmed" };
    const identity = store.identityChecks.find((i) => i.reviewCaseId === caseId);
    if (identity?.status === "conflicting")
      return { ok: false, reason: "identity_conflict_unresolved" };
    const hasConfirmedEvidence = store.extractedEvidence.some(
      (e) => e.reviewCaseId === caseId && (e.status === "confirmed" || e.status === "edited"),
    );
    // A case with zero confirmed evidence may still be reviewable if the
    // scope contains not_reviewable/not_applicable items to report on.
    const snap = store.scopeSnapshots
      .filter((s) => s.reviewCaseId === caseId && s.confirmedAt !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const hasScopeItems = !!snap && snap.criterionScope.length > 0;
    if (!hasConfirmedEvidence && !hasScopeItems) {
      return { ok: false, reason: "no_confirmed_evidence_and_no_not_reviewable" };
    }
    return { ok: true };
  }

  // Runs the deterministic engine and stores a new version. Previous
  // versions for the same case are flagged stale.
  runEngine(
    caseId: string,
    staleReason?: string,
  ): {
    version: ReviewVersion;
    findings: ReviewFinding[];
  } {
    const gate = this.canOpenReview(caseId);
    if (!gate.ok) throw new Error(`Review gate blocked: ${gate.reason}`);
    const store = this.repo.load();
    // Mark existing non-stale versions stale.
    for (const v of store.reviewVersions.filter((v) => v.caseId === caseId && !v.isStale)) {
      v.isStale = true;
      v.staleReason = staleReason ?? "superseded_by_new_run";
    }
    for (const f of store.reviewFindings.filter((f) => f.caseId === caseId && !f.isStale)) {
      f.isStale = true;
    }
    // Package 1C.3 — any live report versions become stale on rerun.
    for (const r of store.reportVersions.filter((r) => r.caseId === caseId)) {
      if (r.status === "draft") {
        r.status = "stale";
        r.staleReason = staleReason ?? "review_rerun";
      } else if (r.status === "finalized" && !r.staleReason) {
        r.staleReason = staleReason ?? "review_rerun";
      }
    }
    this.repo.save(store);

    const versionId = randomId();
    const now = new Date().toISOString();
    const result = this.engine.run(caseId, versionId);
    const store2 = this.repo.load();
    const version: ReviewVersion = {
      versionId,
      caseId,
      scopeSnapshotId: result.scopeSnapshotId,
      engineVersion: ENGINE_VERSION,
      knowledgePackageVersion: getKnowledgeRegistry().packageVersion(),
      createdAt: now,
      isStale: false,
      staleReason: null,
      completedAt: null,
      completedBy: null,
      evidenceDigest: result.evidenceDigest,
    };
    store2.reviewVersions.push(version);
    for (const f of result.findings) store2.reviewFindings.push(f);
    store2.auditEvents.push(
      newAuditEvent(caseId, "review_engine_run", {
        versionId,
        findingCount: result.findings.length,
      }),
    );
    this.repo.save(store2);
    return { version, findings: result.findings };
  }

  currentVersion(caseId: string): ReviewVersion | null {
    const list = this.repo
      .load()
      .reviewVersions.filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }

  allVersions(caseId: string): ReviewVersion[] {
    return this.repo
      .load()
      .reviewVersions.filter((v) => v.caseId === caseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findingsFor(caseId: string, versionId?: string): ReviewFinding[] {
    const store = this.repo.load();
    const filtered = store.reviewFindings.filter(
      (f) => f.caseId === caseId && (versionId ? f.reviewVersionId === versionId : true),
    );
    return filtered.sort((a, b) => a.criterionId.localeCompare(b.criterionId));
  }

  // Detect drift after a run: the confirmed-evidence digest changed since
  // the current version was created, so the run is stale.
  detectDrift(caseId: string): { drifted: boolean; reason: string | null } {
    const current = this.currentVersion(caseId);
    if (!current) return { drifted: false, reason: null };
    const store = this.repo.load();
    const evidence = store.extractedEvidence.filter(
      (e) => e.reviewCaseId === caseId && (e.status === "confirmed" || e.status === "edited"),
    );
    const digest = computeEvidenceDigest(evidence);
    if (digest !== current.evidenceDigest) {
      return { drifted: true, reason: "confirmed_evidence_changed" };
    }
    const c = store.cases.find((x) => x.id === caseId);
    if (c?.scopeNeedsReconfirmation) {
      return { drifted: true, reason: "scope_needs_reconfirmation" };
    }
    return { drifted: false, reason: null };
  }

  // Mark current findings + version stale without generating a new run.
  markStale(caseId: string, reason: string): void {
    const store = this.repo.load();
    for (const v of store.reviewVersions.filter((v) => v.caseId === caseId && !v.isStale)) {
      v.isStale = true;
      v.staleReason = reason;
    }
    for (const f of store.reviewFindings.filter((f) => f.caseId === caseId && !f.isStale)) {
      f.isStale = true;
    }
    for (const r of store.reportVersions.filter((r) => r.caseId === caseId)) {
      if (r.status === "draft") {
        r.status = "stale";
        r.staleReason = reason;
      } else if (r.status === "finalized" && !r.staleReason) {
        r.staleReason = reason;
      }
    }
    store.auditEvents.push(newAuditEvent(caseId, "review_marked_stale", { reason }));
    this.repo.save(store);
  }

  completeHumanReview(caseId: string, actorId: string | null = null): ReviewVersion {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    if (c.status === "closed") throw new Error("Case is closed");
    const current = store.reviewVersions
      .filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!current) throw new Error("No active review version");
    // Ensure no critical finding remains without a human decision.
    const findings = store.reviewFindings.filter(
      (f) => f.reviewVersionId === current.versionId && !f.isStale,
    );
    const criticalPending = findings.find(
      (f) =>
        f.humanReviewStatus === "pending" &&
        f.automatedSeverity === "action_required_before_goal_approval",
    );
    if (criticalPending) {
      throw new Error("Cannot complete review: critical findings still pending human decision");
    }
    const professionalPending = findings.find(
      (f) => f.humanReviewStatus === "pending" && !isSystemClassificationStatus(f.automatedStatus),
    );
    if (professionalPending) {
      throw new Error("Cannot complete review: professional findings still pending human decision");
    }
    const systemPending = findings.find(
      (f) => f.humanReviewStatus === "pending" && isSystemClassificationStatus(f.automatedStatus),
    );
    if (systemPending) {
      throw new Error(
        "Cannot complete review: system classifications still require acknowledgement",
      );
    }
    const drift = this.detectDrift(caseId);
    if (drift.drifted) throw new Error(`Cannot complete review: ${drift.reason}`);
    if (c.scopeNeedsReconfirmation)
      throw new Error("Cannot complete review: scope needs reconfirmation");
    current.completedAt = new Date().toISOString();
    current.completedBy = actorId;
    store.auditEvents.push(
      newAuditEvent(caseId, "review_completed", { versionId: current.versionId }),
    );
    this.repo.save(store);
    return current;
  }
}
