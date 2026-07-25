// Deterministic Review Engine — Package 1C.
// Reads confirmed scope + confirmed evidence + knowledge registry and
// emits a fresh set of ReviewFindings. No AI. No network calls.
// Absence of an optional input never produces `not_achieved`; it produces
// `not_reviewable`.

import type { HimamStore, ReviewCaseRepository } from "../cases/case-repository";
import type {
  ExtractedEvidence,
  ReviewCase,
  ReviewScopeSnapshot,
} from "../cases/case-types";
import type { CriterionRecord, ReviewInputType } from "../knowledge/knowledge-types";
import { getKnowledgeRegistry, KnowledgeRegistry } from "./knowledge-registry";
import {
  ENGINE_VERSION,
  type ActivationReason,
  type FindingSeverity,
  type FindingStatus,
  type FindingTargetType,
  type ReviewFinding,
} from "./review-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Map criterion required-input tokens (from CSV) to case input types.
const REQUIRED_INPUT_TO_SOURCE_TYPE: Record<string, string> = {
  plan: "plan",
  assessment: "assessment",
  family_priorities: "family_priorities",
  student_preference: "student_preferences",
  student_preferences: "student_preferences",
  supports: "supports",
  professional_notes: "professional_notes",
  prior_plan: "prior_plan",
  prior_progress: "prior_progress",
  age: "__age__",
};

function severityFromArabic(defaultSeverity: string): FindingSeverity {
  const s = defaultSeverity.trim();
  if (s === "حرج") return "action_required_before_goal_approval";
  if (s === "متوسط") return "major_plan_gap";
  if (s === "منخفض") return "quality_improvement";
  return "guidance_note";
}

function severityWhenAchieved(): FindingSeverity {
  return "no_judgment";
}

function isPlanGoalCriterion(c: CriterionRecord): boolean {
  // D1 (goal structure), D2 (individualization + evidence base for goals),
  // D3 (educational/functional value) all target individual goals.
  return c.domainId === "D1" || c.domainId === "D2" || c.domainId === "D3";
}

function confirmedEvidence(store: HimamStore, caseId: string): ExtractedEvidence[] {
  return store.extractedEvidence.filter(
    (e) =>
      e.reviewCaseId === caseId && (e.status === "confirmed" || e.status === "edited"),
  );
}

export function computeEvidenceDigest(evidence: ExtractedEvidence[]): string {
  const ids = evidence.map((e) => `${e.id}:${e.status}:${e.updatedAt}`).sort();
  return ids.join("|");
}

export interface EngineRunResult {
  findings: ReviewFinding[];
  evidenceDigest: string;
  scopeSnapshotId: string;
}

export class DeterministicReviewEngine {
  private readonly registry: KnowledgeRegistry;
  constructor(
    private readonly repo: ReviewCaseRepository,
    registry?: KnowledgeRegistry,
  ) {
    this.registry = registry ?? getKnowledgeRegistry();
  }

  run(caseId: string, versionId: string): EngineRunResult {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    if (c.status !== "scope_confirmed" && c.status !== "closed") {
      throw new Error("Scope must be confirmed before running the review engine");
    }
    const snap = latestConfirmedScope(store, caseId);
    if (!snap) throw new Error("No confirmed scope snapshot");

    const evidence = confirmedEvidence(store, caseId);
    const digest = computeEvidenceDigest(evidence);
    const identity = store.identityChecks.find((i) => i.reviewCaseId === caseId);

    const findings: ReviewFinding[] = [];
    const now = new Date().toISOString();

    for (const item of snap.criterionScope) {
      const crit = this.registry.criterion(item.criterionId);
      if (!crit) continue;
      // Only emit findings for what the confirmed scope authorizes.
      if (item.status === "not_applicable") {
        findings.push(
          this.makeFinding(c, versionId, snap, crit, {
            targetType: "case",
            targetId: null,
            evidenceIds: [],
            sourceIds: [],
            automatedStatus: "not_applicable",
            automatedSeverity: "no_judgment",
            rationale: "المعيار خارج نطاق مرحلة الحالة.",
            activationReason: "phase_gate_passed",
            uncertainty: "low",
            now,
          }),
        );
        continue;
      }
      if (item.status === "not_reviewable") {
        findings.push(
          this.makeFinding(c, versionId, snap, crit, {
            targetType: "case",
            targetId: null,
            evidenceIds: [],
            sourceIds: [],
            automatedStatus: "not_reviewable",
            automatedSeverity: "no_judgment",
            rationale: "مدخل مطلوب غير متاح؛ لا يمكن مراجعة هذا المعيار.",
            activationReason: "inputs_available",
            uncertainty: "low",
            now,
          }),
        );
        continue;
      }
      // status === "available"
      const generated = this.evaluateAvailable(store, c, snap, crit, evidence, identity, versionId, now);
      for (const f of generated) findings.push(f);
    }
    return { findings, evidenceDigest: digest, scopeSnapshotId: snap.id };
  }

  private evaluateAvailable(
    store: HimamStore,
    c: ReviewCase,
    snap: ReviewScopeSnapshot,
    crit: CriterionRecord,
    evidence: ExtractedEvidence[],
    identity: HimamStore["identityChecks"][number] | undefined,
    versionId: string,
    now: string,
  ): ReviewFinding[] {
    // Determine expected source-types from required inputs.
    const expectedSourceTypes = crit.requiredInputs
      .map((r) => REQUIRED_INPUT_TO_SOURCE_TYPE[r])
      .filter((t) => t && t !== "__age__");

    const relevantEvidence = evidence.filter((e) => {
      const src = store.sources.find((s) => s.id === e.sourceId);
      return src && (expectedSourceTypes.length === 0 || expectedSourceTypes.includes(src.type));
    });

    // C001, C002, C004 gatekeepers — deterministic based on presence.
    if (crit.criterionType === "gatekeeper") {
      const planPresent = store.sources.some(
        (s) => s.reviewCaseId === c.id && s.type === "plan",
      );
      const agePresent = c.ageYears !== null || c.phaseId !== null;
      let ok = true;
      if (crit.requiredInputs.includes("plan")) ok = ok && planPresent;
      if (crit.requiredInputs.includes("age")) ok = ok && agePresent;
      return [
        this.makeFinding(c, versionId, snap, crit, {
          targetType: "case",
          targetId: null,
          evidenceIds: [],
          sourceIds: relevantEvidence.map((e) => e.sourceId),
          automatedStatus: ok ? "achieved" : "not_achieved",
          automatedSeverity: ok ? severityWhenAchieved() : severityFromArabic(crit.defaultSeverity),
          rationale: ok
            ? "المدخل الأساسي متاح."
            : "المدخل الأساسي غير متاح.",
          activationReason: "gatekeeper_check",
          uncertainty: "low",
          now,
        }),
      ];
    }

    // Integrity: C003 identity match.
    if (crit.criterionType === "integrity") {
      let status: FindingStatus = "needs_clarification";
      let rationale = "لم يتم فحص الهوية بعد.";
      if (identity?.status === "consistent") {
        status = "achieved";
        rationale = "علامات الهوية المؤكدة متطابقة.";
      } else if (identity?.status === "conflicting") {
        status = "not_achieved";
        rationale = "اختلاف بين علامات الهوية المؤكدة.";
      } else if (identity?.status === "acknowledged") {
        status = "needs_clarification";
        rationale = "تم إقرار تعارض الهوية من قبل المراجع.";
      }
      return [
        this.makeFinding(c, versionId, snap, crit, {
          targetType: "case",
          targetId: null,
          evidenceIds: identity?.evidenceIds ?? [],
          sourceIds: [],
          automatedStatus: status,
          automatedSeverity:
            status === "achieved" ? "no_judgment" : severityFromArabic(crit.defaultSeverity),
          rationale,
          activationReason: "integrity_check",
          uncertainty: "low",
          now,
        }),
      ];
    }

    // No confirmed evidence exists that could inform the criterion.
    if (relevantEvidence.length === 0) {
      return [
        this.makeFinding(c, versionId, snap, crit, {
          targetType: "case",
          targetId: null,
          evidenceIds: [],
          sourceIds: [],
          automatedStatus: "not_reviewable",
          automatedSeverity: "no_judgment",
          rationale:
            "لا توجد أدلة مؤكدة تتصل بالمصادر المطلوبة لهذا المعيار.",
          activationReason: "inputs_available",
          uncertainty: "low",
          now,
        }),
      ];
    }

    // Per-plan-goal criteria: emit one finding per confirmed plan_goal.
    if (isPlanGoalCriterion(crit)) {
      const goals = evidence.filter((e) => e.evidenceType === "plan_goal");
      if (goals.length === 0) {
        return [
          this.makeFinding(c, versionId, snap, crit, {
            targetType: "case",
            targetId: null,
            evidenceIds: [],
            sourceIds: [],
            automatedStatus: "not_reviewable",
            automatedSeverity: "no_judgment",
            rationale: "لا توجد أهداف خطة مؤكدة يمكن مراجعتها بحسب هذا المعيار.",
            activationReason: "inputs_available",
            uncertainty: "low",
            now,
          }),
        ];
      }
      return goals.map((g) =>
        this.makeFinding(c, versionId, snap, crit, {
          targetType: "plan_goal",
          targetId: g.id,
          evidenceIds: [g.id],
          sourceIds: [g.sourceId],
          automatedStatus: "needs_clarification",
          automatedSeverity: severityFromArabic(crit.defaultSeverity),
          rationale:
            "الأدلة متاحة، لكن المقارنة الحتمية غير كافية للحكم؛ يحتاج قرار مراجع.",
          activationReason: "inputs_available",
          uncertainty: "high",
          now,
        }),
      );
    }

    // Default: needs_clarification at case level.
    return [
      this.makeFinding(c, versionId, snap, crit, {
        targetType: "case",
        targetId: null,
        evidenceIds: relevantEvidence.map((e) => e.id),
        sourceIds: [...new Set(relevantEvidence.map((e) => e.sourceId))],
        automatedStatus: "needs_clarification",
        automatedSeverity: severityFromArabic(crit.defaultSeverity),
        rationale:
          "الأدلة متاحة، لكن المقارنة الحتمية غير كافية للحكم؛ يحتاج قرار مراجع.",
        activationReason: "inputs_available",
        uncertainty: "medium",
        now,
      }),
    ];
  }

  private makeFinding(
    c: ReviewCase,
    versionId: string,
    _snap: ReviewScopeSnapshot,
    crit: CriterionRecord,
    fields: {
      targetType: FindingTargetType;
      targetId: string | null;
      evidenceIds: string[];
      sourceIds: string[];
      automatedStatus: FindingStatus;
      automatedSeverity: FindingSeverity;
      rationale: string;
      activationReason: ActivationReason;
      uncertainty: "low" | "medium" | "high";
      now: string;
    },
  ): ReviewFinding {
    return {
      findingId: randomId(),
      caseId: c.id,
      reviewVersionId: versionId,
      criterionId: crit.criterionId,
      domainId: crit.domainId,
      reviewLevel: crit.reviewLevel,
      targetType: fields.targetType,
      targetId: fields.targetId,
      evidenceIds: fields.evidenceIds,
      sourceIds: fields.sourceIds,
      automatedStatus: fields.automatedStatus,
      automatedSeverity: fields.automatedSeverity,
      rationale: fields.rationale,
      recommendation: crit.recommendationTemplate,
      limitations: crit.limitations,
      uncertainty: fields.uncertainty,
      activationReason: fields.activationReason,
      createdAt: fields.now,
      engineVersion: ENGINE_VERSION,
      humanReviewStatus: "pending",
      humanDecision: null,
      humanStatus: null,
      humanSeverity: null,
      humanRationale: null,
      humanRecommendation: null,
      reviewedBy: null,
      reviewedAt: null,
      isStale: false,
    };
  }
}

function latestConfirmedScope(
  store: HimamStore,
  caseId: string,
): ReviewScopeSnapshot | null {
  const list = store.scopeSnapshots
    .filter((s) => s.reviewCaseId === caseId && s.confirmedAt !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list[0] ?? null;
}