import type { ReviewCase, ReviewCaseStatus, ReviewPhaseId } from "./case-types";

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
