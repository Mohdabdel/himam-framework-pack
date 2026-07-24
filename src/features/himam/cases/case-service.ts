import { newAuditEvent } from "../audit/audit-service";
import type { AuditEvent } from "../audit/audit-types";
import { getKnowledgePackageVersion } from "../knowledge/knowledge-version";
import type { ReviewInputType } from "../knowledge/knowledge-types";
import { getReviewScope, type ScopeResult } from "../scope/scope-service";
import type { HimamStore, ReviewCaseRepository } from "./case-repository";
import { getDefaultRepository } from "./case-repository";
import { applyTransition, canTransition } from "./case-state-machine";
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
  const n = store.cases.length + 1;
  return "RC-" + String(n).padStart(4, "0");
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
  constructor(repo?: ReviewCaseRepository) {
    this.repo = repo ?? getDefaultRepository();
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
    if (c.status === "draft" && hasAgeOrPhase && hasPlan) {
      c.status = applyTransition(c.status, "complete_minimum_inputs");
      c.updatedAt = new Date().toISOString();
    } else if (c.status === "minimum_inputs_complete" && !(hasAgeOrPhase && hasPlan)) {
      c.status = "draft";
      c.updatedAt = new Date().toISOString();
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
      return src;
    });
  }

  removeSource(sourceId: string): void {
    this.mutate((store) => {
      const idx = store.sources.findIndex((s) => s.id === sourceId);
      if (idx < 0) return;
      const [removed] = store.sources.splice(idx, 1);
      const c = store.cases.find((x) => x.id === removed.reviewCaseId);
      if (c) {
        store.auditEvents.push(
          newAuditEvent(c.id, "source_removed", {
            sourceId: removed.id,
            type: removed.type,
          }),
        );
        this.recomputeStatus(store, c);
      }
    });
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
      const scope = getReviewScope(inputs);
      const snapshot: ReviewScopeSnapshot = {
        id: randomId(),
        reviewCaseId: c.id,
        knowledgePackageVersion: c.knowledgePackageVersion,
        availableDomains: scope.availableDomains,
        notReviewableDomains: scope.notReviewableDomains,
        notApplicableDomains: scope.notApplicableDomains,
        inputTypes: inputs,
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
