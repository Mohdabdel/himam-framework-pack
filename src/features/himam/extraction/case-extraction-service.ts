import { newAuditEvent } from "../audit/audit-service";
import type { HimamStore, ReviewCaseRepository } from "../cases/case-repository";
import { IdentityIntegrityService } from "./identity-integrity-service";

export type CanCompleteReason =
  | "extraction_in_progress"
  | "pending_evidence"
  | "identity_conflict"
  | "plan_missing"
  | "plan_text_and_evidence_missing"
  | "unresolved_text_unavailable_source"
  | "scope_needs_reconfirmation"
  | "case_closed"
  | "case_not_found";

export type CanCompleteResult = { ok: true } | { ok: false; reason: CanCompleteReason };

function evaluate(store: HimamStore, caseId: string): CanCompleteResult {
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) return { ok: false, reason: "case_not_found" };
  if (c.status === "closed") return { ok: false, reason: "case_closed" };
  const runs = store.extractionRuns.filter((r) => r.reviewCaseId === caseId);
  if (runs.some((r) => r.status === "processing" || r.status === "queued")) {
    return { ok: false, reason: "extraction_in_progress" };
  }
  const evidence = store.extractedEvidence.filter((e) => e.reviewCaseId === caseId);
  if (evidence.some((e) => e.status === "pending")) {
    return { ok: false, reason: "pending_evidence" };
  }
  const identity = store.identityChecks.find((i) => i.reviewCaseId === caseId);
  if (identity && identity.status === "conflicting") {
    return { ok: false, reason: "identity_conflict" };
  }
  const sources = store.sources.filter((s) => s.reviewCaseId === caseId);
  const plan = sources.find((s) => s.type === "plan");
  if (!plan) return { ok: false, reason: "plan_missing" };
  const planHasText = plan.extractionStage === "text_extracted";
  const planEvidenceConfirmed = evidence.some(
    (e) => e.sourceId === plan.id && (e.status === "confirmed" || e.status === "edited"),
  );
  if (!planHasText && !planEvidenceConfirmed) {
    return { ok: false, reason: "plan_text_and_evidence_missing" };
  }
  for (const s of sources) {
    if (s.extractionStage === "text_unavailable" && !s.unavailableResolution) {
      return { ok: false, reason: "unresolved_text_unavailable_source" };
    }
  }
  if (c.scopeNeedsReconfirmation) {
    return { ok: false, reason: "scope_needs_reconfirmation" };
  }
  return { ok: true };
}

export class CaseExtractionService {
  private readonly identity: IdentityIntegrityService;
  constructor(private readonly repo: ReviewCaseRepository) {
    this.identity = new IdentityIntegrityService(repo);
  }

  canCompleteExtractionConfirmation(caseId: string): CanCompleteResult {
    try {
      this.identity.recompute(caseId);
    } catch {
      /* ignore */
    }
    return evaluate(this.repo.load(), caseId);
  }

  completeExtractionConfirmation(caseId: string): { ok: true } {
    this.identity.recompute(caseId);
    const evalResult = evaluate(this.repo.load(), caseId);
    if (!evalResult.ok) {
      throw new Error(`Cannot complete: ${evalResult.reason}`);
    }
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId)!;
    c.extractionStage = "extraction_confirmed";
    c.updatedAt = new Date().toISOString();
    store.auditEvents.push(newAuditEvent(caseId, "extraction_confirmation_completed", {}));
    this.repo.save(store);
    return { ok: true };
  }

  resolveUnavailableSource(
    sourceId: string,
    resolution: "manual_evidence_added" | "source_replaced" | "source_excluded_with_reason",
  ): void {
    const store = this.repo.load();
    const s = store.sources.find((x) => x.id === sourceId);
    if (!s) throw new Error("Source not found");
    s.unavailableResolution = resolution;
    this.repo.save(store);
  }
}
