// Package UX-Redesign — Commit 1
// Single source of truth for "what should happen next on this case?".
// Pure/deterministic. Reads the store synchronously. Does NOT perform
// blob checks (call CaseService.hasUsablePlanSource separately when the
// caller needs Blob-level confidence — the resolver treats
// `ready_for_future_ingestion` as usable at the metadata level).
//
// This resolver drives the case center hero CTA and the journey-step
// blocker text. Screens must never invent their own next-action strings.

import type { HimamStore, ReviewCaseRepository } from "./case-repository";
import { getDefaultRepository } from "./case-repository";
import type { JourneyStepId } from "../scope/input-impact";
import type { ReviewCase } from "./case-types";

export type CaseNextActionKind =
  | "open_basics"
  | "attach_plan"
  | "prepare_text"
  | "confirm_evidence"
  | "confirm_scope"
  | "run_review"
  | "complete_human_decisions"
  | "generate_report"
  | "finalize_report"
  | "close_case"
  | "case_closed"
  | "case_not_found";

export interface CaseNextAction {
  kind: CaseNextActionKind;
  stepId: JourneyStepId | null;
  // Arabic label for the primary CTA button. Never a technical value.
  ctaLabelAr: string;
  // TanStack route pattern for the CTA target, or null when no navigation
  // is possible (case closed, case missing).
  ctaHref: string | null;
  // Populated when the next step is not yet reachable — the user needs
  // to first resolve something. Arabic, neutral phrasing.
  blockedReasonAr: string | null;
  // Whether the CTA button should be enabled.
  ctaEnabled: boolean;
  // Short Arabic sentence describing the current stage for the hero.
  stateSummaryAr: string;
}

function hasReadyPlanMeta(store: HimamStore, caseId: string): boolean {
  return store.sources.some(
    (s) =>
      s.reviewCaseId === caseId && s.type === "plan" && s.status === "ready_for_future_ingestion",
  );
}

function currentReviewVersion(store: HimamStore, caseId: string) {
  return (
    store.reviewVersions
      .filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

function latestReport(store: HimamStore, caseId: string) {
  return (
    store.reportVersions
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

function resolveForCase(store: HimamStore, c: ReviewCase): CaseNextAction {
  if (c.status === "closed") {
    return {
      kind: "case_closed",
      stepId: "closure",
      ctaLabelAr: "عرض التقرير المعتمد",
      ctaHref: "/cases/$caseId/report",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr: "الحالة مغلقة — العرض للقراءة فقط.",
    };
  }

  // 1) Basics
  const basicsComplete = c.ageYears !== null || c.phaseId !== null;
  if (!basicsComplete) {
    return {
      kind: "open_basics",
      stepId: "basics",
      ctaLabelAr: "استكمال البيانات الأساسية",
      ctaHref: null,
      blockedReasonAr: "أدخل العمر أو المرحلة قبل المتابعة.",
      ctaEnabled: false,
      stateSummaryAr: "الحالة قيد الإنشاء — البيانات الأساسية غير مكتملة.",
    };
  }

  // 2) Plan attachment
  const hasPlanMeta = hasReadyPlanMeta(store, c.id);
  if (!hasPlanMeta) {
    return {
      kind: "attach_plan",
      stepId: "sources",
      ctaLabelAr: "إرفاق ملف الخطة",
      ctaHref: "/cases/$caseId/sources",
      blockedReasonAr: "أرفق الخطة الحالية للبدء.",
      ctaEnabled: true,
      stateSummaryAr: "الخطة غير مرفقة بعد.",
    };
  }

  // 3) Text preparation
  const caseSources = store.sources.filter((s) => s.reviewCaseId === c.id);
  const textReadyCount = caseSources.filter((s) => s.extractionStage === "text_extracted").length;
  if (textReadyCount === 0) {
    return {
      kind: "prepare_text",
      stepId: "text",
      ctaLabelAr: "تجهيز نصوص المصادر",
      ctaHref: "/cases/$caseId/ingestion",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr: "الخطة مرفقة — التالي: تجهيز النص للمراجعة.",
    };
  }

  // 4) Evidence confirmation
  if (c.extractionStage !== "extraction_confirmed") {
    const pending = store.extractedEvidence.filter(
      (e) => e.reviewCaseId === c.id && e.status === "pending",
    ).length;
    return {
      kind: "confirm_evidence",
      stepId: "evidence",
      ctaLabelAr: "مراجعة الأدلة وتأكيدها",
      ctaHref: "/cases/$caseId/extraction",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr:
        pending > 0
          ? `أدلة بانتظار المراجعة: ${pending}.`
          : "التالي: تأكيد الأدلة قبل تأكيد النطاق.",
    };
  }

  // 5) Final scope confirmation
  if (c.scopeNeedsReconfirmation || c.status !== "scope_confirmed") {
    return {
      kind: "confirm_scope",
      stepId: "scope",
      ctaLabelAr: c.scopeNeedsReconfirmation
        ? "إعادة تأكيد نطاق المراجعة"
        : "تأكيد نطاق المراجعة النهائي",
      ctaHref: "/cases/$caseId/scope",
      blockedReasonAr: c.scopeNeedsReconfirmation ? "تغيّرت المصادر — أعد تأكيد النطاق." : null,
      ctaEnabled: true,
      stateSummaryAr: c.scopeNeedsReconfirmation
        ? "النطاق يحتاج إلى إعادة تأكيد."
        : "التالي: تأكيد نطاق المراجعة النهائي.",
    };
  }

  // 6) Review + human decisions
  const version = currentReviewVersion(store, c.id);
  if (!version) {
    return {
      kind: "run_review",
      stepId: "review",
      ctaLabelAr: "تشغيل المراجعة المهنية",
      ctaHref: "/cases/$caseId/review",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr: "التالي: تشغيل المراجعة الحتمية.",
    };
  }
  if (version.completedAt === null) {
    const pendingHuman = store.reviewFindings.filter(
      (f) =>
        f.reviewVersionId === version.versionId && !f.isStale && f.humanReviewStatus === "pending",
    ).length;
    return {
      kind: "complete_human_decisions",
      stepId: "review",
      ctaLabelAr: "إكمال قرارات المراجع",
      ctaHref: "/cases/$caseId/review",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr:
        pendingHuman > 0
          ? `قرارات بشرية معلقة: ${pendingHuman}.`
          : "التالي: إتمام المراجعة المهنية.",
    };
  }

  // 7) Report
  const report = latestReport(store, c.id);
  if (!report || report.status === "stale") {
    return {
      kind: "generate_report",
      stepId: "report",
      ctaLabelAr: report ? "إنشاء نسخة تقرير جديدة" : "إنشاء التقرير المحكوم",
      ctaHref: "/cases/$caseId/report",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr: report ? "التقرير الحالي يحتاج إلى تحديث." : "التالي: توليد التقرير المحكوم.",
    };
  }
  if (report.status === "draft") {
    return {
      kind: "finalize_report",
      stepId: "report",
      ctaLabelAr: "اعتماد التقرير",
      ctaHref: "/cases/$caseId/report",
      blockedReasonAr: null,
      ctaEnabled: true,
      stateSummaryAr: "مسودة تقرير جاهزة للاعتماد.",
    };
  }

  // 8) Closure
  return {
    kind: "close_case",
    stepId: "closure",
    ctaLabelAr: "إغلاق الحالة",
    ctaHref: "/cases/$caseId/report",
    blockedReasonAr: null,
    ctaEnabled: true,
    stateSummaryAr: "تم اعتماد التقرير — يمكن إغلاق الحالة.",
  };
}

export function resolveCaseNextAction(
  caseId: string,
  repo: ReviewCaseRepository = getDefaultRepository(),
): CaseNextAction {
  const store = repo.load();
  const c = store.cases.find((x) => x.id === caseId);
  if (!c) {
    return {
      kind: "case_not_found",
      stepId: null,
      ctaLabelAr: "العودة إلى قائمة الحالات",
      ctaHref: null,
      blockedReasonAr: "الحالة غير موجودة.",
      ctaEnabled: false,
      stateSummaryAr: "لم يُعثر على الحالة.",
    };
  }
  return resolveForCase(store, c);
}

// Arabic dictionary for review & report gate reasons, used by both the
// case center hero and downstream screens. Kept here so every gate
// message has a single canonical translation.
export const CASE_GATE_REASONS_AR: Record<string, string> = {
  case_not_found: "الحالة غير موجودة.",
  case_closed_read_only: "الحالة مغلقة — العرض للقراءة فقط.",
  scope_not_confirmed: "لم يُؤكَّد نطاق المراجعة بعد.",
  scope_needs_reconfirmation: "النطاق يحتاج إلى إعادة تأكيد.",
  extraction_not_confirmed: "تأكيد الأدلة لم يكتمل بعد.",
  identity_conflict_unresolved: "يوجد تعارض هوية لم يُقرَّ بعد.",
  no_confirmed_evidence_and_no_not_reviewable: "لا توجد أدلة مؤكدة ولا معايير قابلة للعرض.",
  no_review_version: "لم تُشغَّل المراجعة المهنية بعد.",
  review_not_completed: "المراجعة المهنية لم تُكتمل بعد.",
  review_stale: "نتائج المراجعة قديمة — أعد تشغيل المراجعة.",
  critical_findings_pending: "توجد نتائج حرجة بلا قرار بشري.",
  findings_pending_resolution: "توجد نتائج لم تُسوَّ بقرار مهني أو إقرار نظامي.",
  evidence_drift_detected: "تغيّرت الأدلة المؤكدة منذ آخر تشغيل.",
  plan_missing: "الخطة الحالية غير مرفقة.",
  plan_unreadable: "ملف الخطة غير قابل للقراءة.",
};

export function caseGateReasonAr(reason: string): string {
  return CASE_GATE_REASONS_AR[reason] ?? reason;
}
