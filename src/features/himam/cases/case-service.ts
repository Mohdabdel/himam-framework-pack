import { newAuditEvent } from "../audit/audit-service";
import type { AuditEvent } from "../audit/audit-types";
import { getKnowledgePackageVersion } from "../knowledge/knowledge-version";
import type { ReviewInputType } from "../knowledge/knowledge-types";
import { getReviewScope, type ScopeResult } from "../scope/scope-service";
import {
  getDefaultPlanFileStorage,
  planStoragePath,
  type PlanFileStorage,
} from "../sources/plan-file-storage";
import type { HimamStore, ReviewCaseRepository } from "./case-repository";
import { getDefaultRepository } from "./case-repository";
import { applyTransition, canTransition } from "./case-state-machine";
import { validatePlanFile } from "../sources/source-service";
import type {
  InputSource,
  ReviewCase,
  ReviewCaseStatus,
  ReviewPhaseId,
  ReviewScopeSnapshot,
} from "./case-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nextReferenceCode(store: HimamStore): string {
  const year = new Date().getFullYear();
  const prefix = `RC-${year}-`;
  const usedThisYear = store.cases.filter((c) => c.referenceCode.startsWith(prefix)).length;
  let n = usedThisYear + 1;
  const existing = new Set(store.cases.map((c) => c.referenceCode));
  while (existing.has(prefix + String(n).padStart(4, "0"))) n++;
  return prefix + String(n).padStart(4, "0");
}

function hasReadyPlan(store: HimamStore, caseId: string): boolean {
  return store.sources.some(
    (s) =>
      s.reviewCaseId === caseId && s.type === "plan" && s.status === "ready_for_future_ingestion",
  );
}

function inputsForCase(store: HimamStore, c: ReviewCase): ReviewInputType[] {
  const inputs: ReviewInputType[] = [];
  if (c.ageYears !== null || c.phaseId !== null) inputs.push("age_phase");
  const sources = store.sources.filter((s) => s.reviewCaseId === c.id);
  const map: Partial<Record<InputSource["type"], ReviewInputType>> = {
    plan: "plan",
    assessment: "assessment",
    family_priorities: "family_priorities",
    student_preferences: "student_preferences",
    supports: "supports",
    professional_notes: "professional_notes",
    prior_plan: "prior_plan",
    prior_progress: "prior_progress",
  };
  for (const s of sources) {
    if (s.status !== "ready_for_future_ingestion") continue;
    const t = map[s.type];
    if (t) inputs.push(t);
  }
  return inputs;
}

export class CaseService {
  private repo: ReviewCaseRepository;
  private storage: PlanFileStorage;
  constructor(repo?: ReviewCaseRepository, storage?: PlanFileStorage) {
    this.repo = repo ?? getDefaultRepository();
    this.storage = storage ?? getDefaultPlanFileStorage();
  }

  private mutate<T>(fn: (store: HimamStore) => T): T {
    const store = this.repo.load();
    const result = fn(store);
    this.repo.save(store);
    return result;
  }

  private recomputeStatus(store: HimamStore, c: ReviewCase): void {
    const hasAgeOrPhase = c.ageYears !== null || c.phaseId !== null;
    const hasPlan = hasReadyPlan(store, c.id);
    if (c.status === "closed") return;
    if (c.status === "draft" && hasAgeOrPhase && hasPlan) {
      c.status = applyTransition(c.status, "complete_minimum_inputs");
      c.updatedAt = new Date().toISOString();
    } else if (
      (c.status === "minimum_inputs_complete" || c.status === "scope_confirmed") &&
      !(hasAgeOrPhase && hasPlan)
    ) {
      c.status = "draft";
      c.updatedAt = new Date().toISOString();
      // Plan disappeared → invalidate downstream artifacts for this case.
      store.scopeSnapshots = store.scopeSnapshots.filter((sn) => sn.reviewCaseId !== c.id);
      const nowIso = new Date().toISOString();
      for (const ev of store.extractedEvidence) {
        if (ev.reviewCaseId === c.id && ev.status !== "invalidated") {
          ev.status = "invalidated";
          ev.updatedAt = nowIso;
        }
      }
      for (const rv of store.reviewVersions) {
        if (rv.caseId === c.id) rv.isStale = true;
      }
      for (const rp of store.reportVersions) {
        if (rp.caseId === c.id && rp.status === "finalized" && !rp.staleReason) {
          rp.staleReason = "plan_removed";
        }
      }
      c.scopeNeedsReconfirmation = false;
      c.extractionStage = "not_started";
    }
  }

  list(): ReviewCase[] {
    return this.repo
      .load()
      .cases.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): ReviewCase | null {
    return this.repo.load().cases.find((c) => c.id === id) ?? null;
  }

  sourcesFor(caseId: string): InputSource[] {
    return this.repo.load().sources.filter((s) => s.reviewCaseId === caseId);
  }

  latestScope(caseId: string): ReviewScopeSnapshot | null {
    const list = this.repo
      .load()
      .scopeSnapshots.filter((s) => s.reviewCaseId === caseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }

  auditFor(caseId: string): AuditEvent[] {
    return this.repo
      .load()
      .auditEvents.filter((e) => e.reviewCaseId === caseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  createCase(input: {
    ageYears: number | null;
    phaseId: ReviewPhaseId | null;
    planType: string | null;
    referenceCode?: string;
  }): ReviewCase {
    return this.mutate((store) => {
      const now = new Date().toISOString();
      const c: ReviewCase = {
        id: randomId(),
        referenceCode: input.referenceCode?.trim() || nextReferenceCode(store),
        ageYears: input.ageYears,
        phaseId: input.phaseId,
        planType: input.planType,
        status: "draft",
        knowledgePackageVersion: getKnowledgePackageVersion(),
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        extractionStage: "not_started",
        scopeNeedsReconfirmation: false,
      };
      store.cases.push(c);
      store.auditEvents.push(
        newAuditEvent(c.id, "case_created", {
          referenceCode: c.referenceCode,
          ageYears: c.ageYears,
          phaseId: c.phaseId,
          planType: c.planType,
        }),
      );
      return c;
    });
  }

  updateCase(
    id: string,
    patch: Partial<Pick<ReviewCase, "ageYears" | "phaseId" | "planType">>,
  ): ReviewCase {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === id);
      if (!c) throw new Error("Case not found");
      if (patch.ageYears !== undefined) c.ageYears = patch.ageYears;
      if (patch.phaseId !== undefined) c.phaseId = patch.phaseId;
      if (patch.planType !== undefined) c.planType = patch.planType;
      c.updatedAt = new Date().toISOString();
      this.recomputeStatus(store, c);
      store.auditEvents.push(newAuditEvent(c.id, "case_updated", { ...patch }));
      return c;
    });
  }

  registerSource(input: {
    reviewCaseId: string;
    type: InputSource["type"];
    fileName: string;
    mimeType: string | null;
    status?: InputSource["status"];
  }): InputSource {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === input.reviewCaseId);
      if (!c) throw new Error("Case not found");
      if (c.status === "closed") throw new Error("Case is closed");
      const src: InputSource = {
        id: randomId(),
        reviewCaseId: c.id,
        type: input.type,
        fileName: input.fileName,
        mimeType: input.mimeType,
        storagePath: null,
        sourceDate: null,
        status: input.status ?? "ready_for_future_ingestion",
        createdAt: new Date().toISOString(),
        extractionStage: "not_started",
        sourceHash: null,
        languageHint: null,
        unavailableResolution: null,
        manualTextArtifactId: null,
      };
      store.sources.push(src);
      store.auditEvents.push(
        newAuditEvent(c.id, "source_registered", {
          sourceId: src.id,
          type: src.type,
          status: src.status,
        }),
      );
      this.recomputeStatus(store, c);
      // Package 1B.2 — adding a source may change scope; flag reconfirmation
      // only if the case has already confirmed a scope earlier.
      if (c.status === "scope_confirmed") {
        c.scopeNeedsReconfirmation = true;
        store.auditEvents.push(
          newAuditEvent(c.id, "scope_reconfirmation_required", { reason: "source_added" }),
        );
      }
      if (c.extractionStage === "not_started") c.extractionStage = "sources_registered";
      return src;
    });
  }

  async removeSource(sourceId: string): Promise<void> {
    // Delete Blob before mutating the store, so a partial failure never
    // leaves an `idb://` reference to a phantom object.
    try {
      await this.storage.delete(sourceId);
    } catch {
      /* best-effort cleanup */
    }
    // Delete any text artifact Blobs bound to this source, then the metadata
    // gets removed in the mutate() block below.
    const preStore = this.repo.load();
    for (const a of preStore.textArtifacts.filter((x) => x.sourceId === sourceId)) {
      try {
        await this.storage.deleteText(a.id);
      } catch {
        /* best-effort cleanup */
      }
    }
    this.mutate((store) => {
      const idx = store.sources.findIndex((s) => s.id === sourceId);
      if (idx < 0) return;
      const [removed] = store.sources.splice(idx, 1);
      store.textArtifacts = store.textArtifacts.filter((a) => a.sourceId !== sourceId);
      store.textChunks = store.textChunks.filter((c) => c.sourceId !== sourceId);
      store.extractedEvidence = store.extractedEvidence.filter((e) => e.sourceId !== sourceId);
      // Extraction runs that only touched this source are cleared.
      store.extractionRuns = store.extractionRuns.filter(
        (r) => !r.sourceIds.every((s) => s === sourceId),
      );
      const c = store.cases.find((x) => x.id === removed.reviewCaseId);
      if (c) {
        store.auditEvents.push(
          newAuditEvent(c.id, "source_removed", {
            sourceId: removed.id,
            type: removed.type,
          }),
        );
        this.recomputeStatus(store, c);
        if (c.status === "scope_confirmed") {
          c.scopeNeedsReconfirmation = true;
          store.auditEvents.push(
            newAuditEvent(c.id, "scope_reconfirmation_required", { reason: "source_removed" }),
          );
        }
        // If the case had already confirmed extraction, drop back to text_ready.
        if (
          c.extractionStage === "extraction_confirmed" ||
          c.extractionStage === "confirmation_required"
        ) {
          c.extractionStage = "sources_registered";
        }
      }
    });
  }

  async attachPlanFile(sourceId: string, blob: Blob): Promise<InputSource> {
    await this.storage.put(sourceId, blob);
    return this.mutate((store) => {
      const s = store.sources.find((x) => x.id === sourceId);
      if (!s) throw new Error("Source not found");
      s.storagePath = planStoragePath(sourceId);
      if (s.type === "plan") s.status = "ready_for_future_ingestion";
      const c = store.cases.find((x) => x.id === s.reviewCaseId);
      if (c) this.recomputeStatus(store, c);
      return s;
    });
  }

  async reconcile(): Promise<void> {
    const store = this.repo.load();
    let changed = false;
    for (const s of store.sources) {
      if (s.type !== "plan" || !s.storagePath) continue;
      const ok = await this.storage.has(s.id);
      if (!ok && s.status !== "file_missing") {
        s.status = "file_missing";
        changed = true;
      } else if (ok && s.status === "file_missing") {
        s.status = "ready_for_future_ingestion";
        changed = true;
      }
    }
    if (changed) {
      for (const c of store.cases) this.recomputeStatus(store, c);
      this.repo.save(store);
    }
  }

  generateScope(caseId: string): {
    snapshot: ReviewScopeSnapshot;
    scope: ScopeResult;
  } {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === caseId);
      if (!c) throw new Error("Case not found");
      if (c.status !== "minimum_inputs_complete" && c.status !== "scope_confirmed") {
        throw new Error("Cannot generate scope unless minimum inputs are complete.");
      }
      const inputs = inputsForCase(store, c);
      const scope = getReviewScope({ inputs, phaseId: c.phaseId });
      const snapshot: ReviewScopeSnapshot = {
        id: randomId(),
        reviewCaseId: c.id,
        knowledgePackageVersion: c.knowledgePackageVersion,
        availableDomains: scope.availableDomains,
        notReviewableDomains: scope.notReviewableDomains,
        notApplicableDomains: scope.notApplicableDomains,
        inputTypes: inputs,
        criterionScope: scope.criterionScope,
        confirmedAt: null,
        createdAt: new Date().toISOString(),
      };
      store.scopeSnapshots.push(snapshot);
      store.auditEvents.push(
        newAuditEvent(c.id, "scope_generated", {
          snapshotId: snapshot.id,
          available: snapshot.availableDomains,
          notReviewable: snapshot.notReviewableDomains,
        }),
      );
      return { snapshot, scope };
    });
  }

  confirmScope(caseId: string): ReviewCase {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === caseId);
      if (!c) throw new Error("Case not found");
      if (!canTransition(c.status, "confirm_scope")) {
        throw new Error(`Cannot confirm scope while case status is ${c.status}.`);
      }
      const snap = store.scopeSnapshots
        .filter((s) => s.reviewCaseId === c.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!snap) {
        throw new Error("Generate the scope before confirming it.");
      }
      snap.confirmedAt = new Date().toISOString();
      c.status = applyTransition(c.status, "confirm_scope");
      c.updatedAt = new Date().toISOString();
      store.auditEvents.push(newAuditEvent(c.id, "scope_confirmed", { snapshotId: snap.id }));
      return c;
    });
  }

  closeCase(caseId: string): ReviewCase {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === caseId);
      if (!c) throw new Error("Case not found");
      if (!canTransition(c.status, "close_case")) {
        throw new Error(`Cannot close case while status is ${c.status}.`);
      }
      c.status = applyTransition(c.status, "close_case");
      const now = new Date().toISOString();
      c.closedAt = now;
      c.updatedAt = now;
      store.auditEvents.push(newAuditEvent(c.id, "case_closed", {}));
      return c;
    });
  }

  // Package 1C.3 — closing after a governed report requires a finalized,
  // non-stale report that references the current (non-stale) review
  // version. This is stricter than plain `closeCase`.
  closeCaseAfterFinalReport(caseId: string): ReviewCase {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === caseId);
      if (!c) throw new Error("Case not found");
      const current = store.reviewVersions
        .filter((v) => v.caseId === caseId && !v.isStale)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const latest = store.reportVersions
        .filter((r) => r.caseId === caseId && r.status === "finalized")
        .sort((a, b) => b.versionNumber - a.versionNumber)[0];
      if (!latest) throw new Error("No finalized governed report");
      if (latest.staleReason) throw new Error("Latest finalized report is stale");
      if (!current || current.versionId !== latest.reviewVersionId) {
        throw new Error("Latest finalized report does not match the active review version");
      }
      if (!canTransition(c.status, "close_case")) {
        throw new Error(`Cannot close case while status is ${c.status}.`);
      }
      c.status = applyTransition(c.status, "close_case");
      const now = new Date().toISOString();
      c.closedAt = now;
      c.updatedAt = now;
      store.auditEvents.push(
        newAuditEvent(c.id, "case_closed_after_report", {
          reportVersionId: latest.reportVersionId,
          versionNumber: latest.versionNumber,
        }),
      );
      return c;
    });
  }

  // Package 1B.3 — reconfirm the scope after sources changed. Produces a
  // brand-new confirmed snapshot and clears scopeNeedsReconfirmation. Old
  // snapshots are preserved for audit.
  reconfirmScope(caseId: string): {
    snapshot: ReviewScopeSnapshot;
    scope: ScopeResult;
  } {
    return this.mutate((store) => {
      const c = store.cases.find((x) => x.id === caseId);
      if (!c) throw new Error("Case not found");
      if (c.status === "closed") throw new Error("Case is closed");
      if (!c.scopeNeedsReconfirmation) {
        throw new Error("Scope does not need reconfirmation");
      }
      const inputs = inputsForCase(store, c);
      const scope = getReviewScope({ inputs, phaseId: c.phaseId });
      const now = new Date().toISOString();
      const snapshot: ReviewScopeSnapshot = {
        id: randomId(),
        reviewCaseId: c.id,
        knowledgePackageVersion: c.knowledgePackageVersion,
        availableDomains: scope.availableDomains,
        notReviewableDomains: scope.notReviewableDomains,
        notApplicableDomains: scope.notApplicableDomains,
        inputTypes: inputs,
        criterionScope: scope.criterionScope,
        confirmedAt: now,
        createdAt: now,
      };
      store.scopeSnapshots.push(snapshot);
      c.scopeNeedsReconfirmation = false;
      c.updatedAt = now;
      store.auditEvents.push(newAuditEvent(c.id, "scope_reconfirmed", { snapshotId: snapshot.id }));
      return { snapshot, scope };
    });
  }

  // Package 1B.3 — the last confirmed scope, used to diff against the
  // current draft for reconfirmation.
  lastConfirmedScope(caseId: string): ReviewScopeSnapshot | null {
    const list = this.repo
      .load()
      .scopeSnapshots.filter((s) => s.reviewCaseId === caseId && s.confirmedAt !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }

  attemptIllegalTransition(
    caseId: string,
    target: ReviewCaseStatus,
  ): { ok: false; reason: string } | { ok: true } {
    const c = this.get(caseId);
    if (!c) return { ok: false, reason: "Case not found" };
    const legalNext: Partial<Record<ReviewCaseStatus, ReviewCaseStatus>> = {
      draft: "minimum_inputs_complete",
      minimum_inputs_complete: "scope_confirmed",
      scope_confirmed: "closed",
    };
    if (legalNext[c.status] !== target) {
      return { ok: false, reason: "Illegal transition" };
    }
    return { ok: true };
  }
}
