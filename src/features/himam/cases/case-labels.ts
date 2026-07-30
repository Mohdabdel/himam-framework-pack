import type {
  CaseExtractionStage,
  EvidenceReviewStatus,
  EvidenceType,
  ExtractionStage,
  InputSourceType,
  ReviewCase,
  ReviewCaseStatus,
  ReviewPhaseId,
  TextLocator,
} from "./case-types";

// Arabic, user-facing description of where a quote sits inside its source.
export function locatorLabelAr(l: TextLocator): string {
  switch (l.kind) {
    case "pdf_page":
      return `صفحة ${l.pageNumber}`;
    case "docx_paragraph":
      return `فقرة ${l.paragraphIndex + 1}`;
    case "text_lines":
      return `الأسطر ${l.lineStart + 1}–${l.lineEnd + 1}`;
    case "manual_text":
      return "نص مُدخَل يدويًا";
  }
}

export const PHASE_LABELS_AR: Record<ReviewPhaseId, string> = {
  early_intervention: "التدخل المبكر",
  preschool: "ما قبل المدرسة",
  elementary: "المرحلة الابتدائية",
  middle: "المرحلة المتوسطة",
  high_school: "المرحلة الثانوية",
  adult_transition: "الانتقال إلى الرشد",
  postsecondary_employment: "ما بعد المدرسة والتوظيف",
};

export function phaseLabelAr(phaseId: ReviewPhaseId | null | undefined): string {
  if (!phaseId) return "غير محددة";
  return PHASE_LABELS_AR[phaseId] ?? "غير محددة";
}

export const STATUS_LABELS_AR: Record<ReviewCaseStatus, string> = {
  draft: "مسودة",
  minimum_inputs_complete: "المدخلات الدنيا مكتملة",
  scope_confirmed: "النطاق مؤكد",
  closed: "مغلقة",
};

export function statusLabelAr(status: ReviewCaseStatus): string {
  return STATUS_LABELS_AR[status];
}

export const STATUS_BADGE_CLASSES: Record<ReviewCaseStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  minimum_inputs_complete: "bg-amber-100 text-amber-900 border-amber-200",
  scope_confirmed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  closed: "bg-slate-200 text-slate-800 border-slate-300",
};

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function formatArabicDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// UI-only heuristic: approximate phase → typical age range. The scope engine
// does NOT consult these numbers; they only power a non-blocking hint.
const PHASE_AGE_HINT: Record<ReviewPhaseId, [number, number]> = {
  early_intervention: [0, 3],
  preschool: [3, 6],
  elementary: [6, 12],
  middle: [11, 15],
  high_school: [14, 19],
  adult_transition: [18, 22],
  postsecondary_employment: [21, 100],
};

export function detectPhaseAgeInconsistency(
  ageYears: number | null | undefined,
  phaseId: ReviewPhaseId | null | undefined,
): boolean {
  if (ageYears == null || phaseId == null) return false;
  const [min, max] = PHASE_AGE_HINT[phaseId];
  return ageYears < min - 1 || ageYears > max + 1;
}

export function shortCaseId(c: Pick<ReviewCase, "id">): string {
  return c.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

// -------------------- Package 1B UI labels --------------------

export const SOURCE_TYPE_LABELS_AR: Record<InputSourceType, string> = {
  plan: "الخطة الحالية",
  assessment: "تقارير التقييم",
  family_priorities: "أولويات الأسرة",
  student_preferences: "تفضيلات المتعلم",
  supports: "الدعم والتسهيلات",
  professional_notes: "الملاحظات المهنية",
  prior_plan: "الخطة السابقة",
  prior_progress: "بيانات التقدم السابقة",
};

export const SOURCE_TYPES_ORDER: InputSourceType[] = [
  "plan",
  "assessment",
  "family_priorities",
  "student_preferences",
  "supports",
  "professional_notes",
  "prior_plan",
  "prior_progress",
];

// Source types that permit a single active source (Plan and Prior Plan).
export const SINGLE_ACTIVE_SOURCE_TYPES: InputSourceType[] = ["plan", "prior_plan"];

// Source types where reviewers may enter free manual text instead of a file.
export const MANUAL_TEXT_SOURCE_TYPES: InputSourceType[] = [
  "family_priorities",
  "student_preferences",
  "supports",
  "professional_notes",
  "prior_progress",
];

export const EVIDENCE_TYPE_LABELS_AR: Record<EvidenceType, string> = {
  plan_goal: "هدف خطة",
  baseline_statement: "خط أساس",
  need_statement: "بيان احتياج",
  assessment_finding: "نتيجة تقييم",
  family_priority: "أولوية أسرة",
  student_preference: "تفضيل متعلم",
  support: "دعم",
  accommodation: "تكييف/تسهيل",
  progress_measure: "مقياس تقدم",
  decision_rule: "قاعدة قرار",
  professional_observation: "ملاحظة مهنية",
  prior_goal: "هدف سابق",
  prior_progress: "تقدم سابق",
  identity_marker: "علامة هوية",
  other: "غير ذلك",
};

export const EVIDENCE_STATUS_LABELS_AR: Record<EvidenceReviewStatus, string> = {
  pending: "معلق",
  confirmed: "مؤكد",
  edited: "معدل",
  rejected: "مرفوض",
  invalidated: "ملغى",
};

export const EXTRACTION_STAGE_LABELS_AR: Record<ExtractionStage, string> = {
  not_started: "لم يبدأ",
  text_extracted: "النص جاهز",
  text_unavailable: "لا يوجد نص قابل للاستخراج",
  failed: "فشل",
};

export const CASE_STAGE_LABELS_AR: Record<CaseExtractionStage, string> = {
  not_started: "لم يبدأ",
  sources_registered: "المصادر مسجّلة",
  text_ready: "النصوص جاهزة",
  extraction_in_progress: "جارٍ استخراج الأدلة",
  confirmation_required: "بانتظار مراجعة الأدلة",
  extraction_confirmed: "تأكيد الأدلة مكتمل",
  blocked: "متوقف",
};
