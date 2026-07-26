// Package 1C.3 Addendum — UX helpers for input impact & case journey.
// Presentation-layer only. Does NOT persist anything; does NOT call the
// deterministic review engine; does NOT change scope confirmation state.

import type { InputSourceType, ReviewCase, ReviewPhaseId } from "../cases/case-types";
import type { ReviewInputType, ScopeItemStatus } from "../knowledge/knowledge-types";
import { getReviewScope, type ScopeResult } from "./scope-service";

export type InputImpactKey =
  | "plan"
  | "age_phase"
  | "assessment"
  | "family_priorities"
  | "student_preferences"
  | "supports"
  | "professional_notes"
  | "prior_plan"
  | "prior_progress";

export type InputRequirement = "required" | "optional" | "required_either";

export interface InputImpact {
  key: InputImpactKey;
  titleAr: string;
  requirement: InputRequirement;
  requirementLabelAr: string;
  whenPresentAr: string;
  whenAbsentAr: string;
}

// Central Arabic copy for every input, following the addendum wording.
// Never uses failure language ("مفقود"، "ناقص"، "لا يمكن مراجعة الخطة").
export const INPUT_IMPACTS: Record<InputImpactKey, InputImpact> = {
  plan: {
    key: "plan",
    titleAr: "الخطة الحالية",
    requirement: "required",
    requirementLabelAr: "إلزامي",
    whenPresentAr:
      "تمثل المصدر الأساسي لمراجعة الأهداف وبنية الخطة.",
    whenAbsentAr:
      "لا يمكن بدء تجهيز المراجعة قبل إرفاق الخطة.",
  },
  age_phase: {
    key: "age_phase",
    titleAr: "العمر أو المرحلة",
    requirement: "required_either",
    requirementLabelAr: "إلزامي أحدهما",
    whenPresentAr:
      "يُستخدم لتحديد المعايير والمآلات الملائمة للمرحلة، ولا يُستخدم لاستنتاج القدرة.",
    whenAbsentAr:
      "يتعذر تحديد نطاق المعايير الملائمة للمرحلة قبل إدخال العمر أو المرحلة.",
  },
  assessment: {
    key: "assessment",
    titleAr: "تقرير أو نتائج التقييم",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr:
      "يتيح مراجعة ارتباط الاحتياجات وخطوط الأساس والأهداف بنتائج التقييم.",
    whenAbsentAr:
      "تظهر المعايير المعتمدة على التقييم بوصفها غير قابلة للمراجعة، دون اعتبار ذلك فشلًا في الخطة.",
  },
  family_priorities: {
    key: "family_priorities",
    titleAr: "أولويات الأسرة",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr: "يتيح مراجعة حضور أولويات الأسرة واتساقها مع الخطة.",
    whenAbsentAr: "لا يمكن الحكم على اتساق الخطة مع أولويات الأسرة.",
  },
  student_preferences: {
    key: "student_preferences",
    titleAr: "تفضيلات المتعلم",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr: "يتيح مراجعة حضور صوت المتعلم وتفضيلاته.",
    whenAbsentAr: "لا يمكن الحكم على تمثيل تفضيلات المتعلم.",
  },
  supports: {
    key: "supports",
    titleAr: "الدعم والتسهيلات",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr:
      "يتيح مراجعة اتساق الدعم والتسهيلات مع الاحتياجات والأهداف.",
    whenAbsentAr:
      "تظل المعايير المعتمدة على معلومات الدعم غير قابلة للمراجعة.",
  },
  professional_notes: {
    key: "professional_notes",
    titleAr: "الملاحظات المهنية",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr:
      "توفر أدلة سياقية إضافية ولا تستبدل التقييم أو القرار المهني.",
    whenAbsentAr:
      "يتعذر توثيق ملاحظات مهنية إضافية داعمة لعناصر المراجعة.",
  },
  prior_plan: {
    key: "prior_plan",
    titleAr: "الخطة السابقة",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr:
      "تتيح مراجعة الاستمرارية والتغير والتكرار مقارنةً بالخطة الحالية.",
    whenAbsentAr: "لا يمكن مراجعة الاستمرارية أو تكرار عناصر الخطة السابقة.",
  },
  prior_progress: {
    key: "prior_progress",
    titleAr: "بيانات التقدم السابقة",
    requirement: "optional",
    requirementLabelAr: "اختياري",
    whenPresentAr: "تتيح مراجعة التقدم الموثق ومدى الاستفادة منه.",
    whenAbsentAr: "لا يمكن مراجعة التقدم السابق.",
  },
};

export function describeInputImpact(key: InputImpactKey): InputImpact {
  return INPUT_IMPACTS[key];
}

// Neutral disclaimer for the provisional scope panel.
export const PROVISIONAL_SCOPE_DISCLAIMER_AR =
  "هذا تقدير لنطاق المراجعة الممكن وفق المصادر المتاحة، وليس نتيجة لمراجعة جودة الخطة.";

// Neutral phrasing to explain missing optional inputs inside the report.
export function describeInputAbsenceForReport(key: InputImpactKey): string {
  switch (key) {
    case "assessment":
      return "لم تتوفر بيانات تقييم ضمن مصادر هذه النسخة؛ لذلك لم يكن من الممكن مراجعة المعايير التي تتطلب ارتباطًا بنتائج تقييم موثقة.";
    case "family_priorities":
      return "لم تُسجَّل أولويات أسرة ضمن مصادر هذه النسخة؛ لذلك لم يكن من الممكن مراجعة اتساق الخطة مع أولويات الأسرة.";
    case "student_preferences":
      return "لم تُسجَّل تفضيلات متعلم ضمن مصادر هذه النسخة؛ لذلك لم يكن من الممكن مراجعة تمثيل صوت المتعلم.";
    case "supports":
      return "لم تُسجَّل معلومات دعم أو تسهيلات ضمن مصادر هذه النسخة.";
    case "professional_notes":
      return "لم تُسجَّل ملاحظات مهنية ضمن مصادر هذه النسخة.";
    case "prior_plan":
      return "لم تتوفر خطة سابقة ضمن مصادر هذه النسخة؛ لذلك لم يكن من الممكن مراجعة الاستمرارية.";
    case "prior_progress":
      return "لم تتوفر بيانات تقدم سابقة ضمن مصادر هذه النسخة.";
    default:
      return "";
  }
}

// ------------------------- Provisional scope helpers -------------------------

export interface ScopeBucketCounts {
  available: number;
  notReviewable: number;
  notApplicable: number;
}

export function countScopeBuckets(scope: ScopeResult): ScopeBucketCounts {
  const out: ScopeBucketCounts = { available: 0, notReviewable: 0, notApplicable: 0 };
  for (const item of scope.criterionScope) {
    const s: ScopeItemStatus = item.status;
    if (s === "available") out.available++;
    else if (s === "not_reviewable") out.notReviewable++;
    else out.notApplicable++;
  }
  return out;
}

export function computeProvisionalScope(
  inputs: ReviewInputType[],
  phaseId: ReviewPhaseId | null,
): ScopeResult {
  return getReviewScope({ inputs, phaseId });
}

const OPTIONAL_PAIRS: [InputSourceType, ReviewInputType][] = [
  ["assessment", "assessment"],
  ["family_priorities", "family_priorities"],
  ["student_preferences", "student_preferences"],
  ["supports", "supports"],
  ["professional_notes", "professional_notes"],
  ["prior_plan", "prior_plan"],
  ["prior_progress", "prior_progress"],
];

// Which optional sources — if added — would move at least one criterion
// from `not_reviewable` to `available`, given the current input mix.
export function expandableSources(
  currentInputs: ReviewInputType[],
  phaseId: ReviewPhaseId | null,
): InputSourceType[] {
  const base = countScopeBuckets(computeProvisionalScope(currentInputs, phaseId));
  const out: InputSourceType[] = [];
  for (const [src, t] of OPTIONAL_PAIRS) {
    if (currentInputs.includes(t)) continue;
    const next = countScopeBuckets(computeProvisionalScope([...currentInputs, t], phaseId));
    if (next.available > base.available) out.push(src);
  }
  return out;
}

// ------------------------- Case journey stepper -------------------------

export type JourneyStepId =
  | "basics"
  | "sources"
  | "text"
  | "evidence"
  | "scope"
  | "review"
  | "report"
  | "closure";

export type JourneyStepState =
  | "not_started"
  | "in_progress"
  | "complete"
  | "needs_action"
  | "needs_update"
  | "read_only";

export interface JourneyStepDef {
  id: JourneyStepId;
  labelAr: string;
  descriptionAr: string;
}

// Order matches Section 6 of the addendum.
export const JOURNEY_STEPS: JourneyStepDef[] = [
  {
    id: "basics",
    labelAr: "البيانات الأساسية",
    descriptionAr: "الرمز المرجعي، العمر أو المرحلة، نوع الخطة، ورفع الخطة الحالية.",
  },
  {
    id: "sources",
    labelAr: "المصادر",
    descriptionAr: "إضافة المصادر الاختيارية وشرح أثر كل مصدر.",
  },
  {
    id: "text",
    labelAr: "تجهيز النصوص",
    descriptionAr: "استخراج النص ومعاينة المقاطع ومعالجة المصادر غير القابلة للقراءة.",
  },
  {
    id: "evidence",
    labelAr: "تأكيد الأدلة",
    descriptionAr: "مراجعة الأدلة اليدوية أو الآلية وفحص سلامة الهوية.",
  },
  {
    id: "scope",
    labelAr: "تأكيد نطاق المراجعة",
    descriptionAr: "مقارنة النطاق المبدئي بالنطاق النهائي وتأكيده.",
  },
  {
    id: "review",
    labelAr: "المراجعة المهنية",
    descriptionAr: "تشغيل المراجعة الحتمية واتخاذ قرارات المراجع البشري.",
  },
  {
    id: "report",
    labelAr: "التقرير",
    descriptionAr: "توليد التقرير المحكوم واعتماده.",
  },
  {
    id: "closure",
    labelAr: "إغلاق الحالة",
    descriptionAr: "إغلاق الحالة بعد اعتماد التقرير.",
  },
];

export const JOURNEY_STATE_LABELS_AR: Record<JourneyStepState, string> = {
  not_started: "لم تبدأ",
  in_progress: "قيد التنفيذ",
  complete: "مكتملة",
  needs_action: "تحتاج إجراء",
  needs_update: "تحتاج تحديثًا",
  read_only: "للقراءة فقط",
};

export interface JourneyContext {
  reviewCase: ReviewCase | null;
  hasReadyPlan: boolean;
  sourcesCount: number;
  textReadyCount: number;
  pendingEvidenceCount: number;
  confirmedEvidenceCount: number;
  reviewFinalized: boolean;
  reviewStale: boolean;
  reportFinalized: boolean;
  reportStale: boolean;
}

export interface JourneyStepStatus {
  step: JourneyStepDef;
  state: JourneyStepState;
  blockedReasonAr?: string;
}

export function computeJourneyStatuses(ctx: JourneyContext): JourneyStepStatus[] {
  const c = ctx.reviewCase;
  const closed = c?.status === "closed";
  const isReadOnly = (s: JourneyStepState): JourneyStepState => (closed ? "read_only" : s);

  const out: JourneyStepStatus[] = [];

  // basics
  const basicsComplete = !!c && (c.ageYears !== null || c.phaseId !== null);
  out.push({
    step: JOURNEY_STEPS[0],
    state: !c
      ? "not_started"
      : basicsComplete
        ? isReadOnly("complete")
        : "needs_action",
    blockedReasonAr: !basicsComplete ? "أدخل العمر أو المرحلة." : undefined,
  });

  // sources — plan required
  const hasPlan = ctx.hasReadyPlan;
  out.push({
    step: JOURNEY_STEPS[1],
    state: !c
      ? "not_started"
      : hasPlan
        ? isReadOnly(ctx.sourcesCount > 1 ? "complete" : "complete")
        : "needs_action",
    blockedReasonAr: !hasPlan ? "أرفق الخطة الحالية." : undefined,
  });

  // text preparation
  const textState: JourneyStepState = !hasPlan
    ? "not_started"
    : ctx.textReadyCount === 0
      ? "needs_action"
      : ctx.textReadyCount < ctx.sourcesCount
        ? "in_progress"
        : "complete";
  out.push({
    step: JOURNEY_STEPS[2],
    state: isReadOnly(textState),
    blockedReasonAr:
      textState === "needs_action"
        ? "جهّز نص الخطة."
        : textState === "in_progress"
          ? "بقيت مصادر بلا نص جاهز."
          : undefined,
  });

  // evidence confirmation
  const evState: JourneyStepState = (() => {
    if (!c) return "not_started";
    if (c.extractionStage === "extraction_confirmed") return "complete";
    if (ctx.pendingEvidenceCount > 0) return "needs_action";
    if (ctx.confirmedEvidenceCount > 0) return "in_progress";
    if (textState === "complete") return "needs_action";
    return "not_started";
  })();
  out.push({
    step: JOURNEY_STEPS[3],
    state: isReadOnly(evState),
    blockedReasonAr:
      evState === "needs_action" ? "عالج الأدلة المعلقة أو أضف دليلًا يدويًا." : undefined,
  });

  // final scope confirmation
  const scopeState: JourneyStepState = (() => {
    if (!c) return "not_started";
    if (c.extractionStage !== "extraction_confirmed") return "not_started";
    if (c.scopeNeedsReconfirmation) return "needs_update";
    if (c.status === "scope_confirmed" || c.status === "closed") return "complete";
    return "needs_action";
  })();
  out.push({
    step: JOURNEY_STEPS[4],
    state: isReadOnly(scopeState),
    blockedReasonAr:
      scopeState === "not_started"
        ? "أكمل تأكيد الأدلة قبل تأكيد النطاق النهائي."
        : scopeState === "needs_update"
          ? "أعد تأكيد نطاق المراجعة بعد التغييرات."
          : scopeState === "needs_action"
            ? "أكد نطاق المراجعة النهائي."
            : undefined,
  });

  // review
  const reviewUnlocked = c?.extractionStage === "extraction_confirmed";
  const reviewState: JourneyStepState = !reviewUnlocked
    ? "not_started"
    : ctx.reviewStale
      ? "needs_update"
      : ctx.reviewFinalized
        ? "complete"
        : "needs_action";
  out.push({
    step: JOURNEY_STEPS[5],
    state: isReadOnly(reviewState),
    blockedReasonAr:
      reviewState === "not_started"
        ? "أكمل تأكيد الأدلة قبل تشغيل المراجعة."
        : reviewState === "needs_action"
          ? "أكمل القرارات البشرية."
          : undefined,
  });

  // report
  const reportState: JourneyStepState = !ctx.reviewFinalized
    ? "not_started"
    : ctx.reportStale
      ? "needs_update"
      : ctx.reportFinalized
        ? "complete"
        : "needs_action";
  out.push({
    step: JOURNEY_STEPS[6],
    state: isReadOnly(reportState),
    blockedReasonAr:
      reportState === "not_started"
        ? "أكمل المراجعة المهنية قبل التقرير."
        : reportState === "needs_action"
          ? "أنشئ واعتمد التقرير."
          : undefined,
  });

  // closure
  const closureState: JourneyStepState = closed
    ? "complete"
    : ctx.reportFinalized
      ? "needs_action"
      : "not_started";
  out.push({
    step: JOURNEY_STEPS[7],
    state: closureState,
    blockedReasonAr:
      closureState === "not_started" ? "لا يمكن الإغلاق قبل اعتماد التقرير." : undefined,
  });

  return out;
}