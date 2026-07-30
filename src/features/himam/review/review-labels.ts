import type {
  FindingSeverity,
  FindingStatus,
  HumanDecision,
  ReportVersionStatus,
} from "./review-types";

// G1 — عدم اليقين مخزَّن في كل ملاحظة ويجب أن يُعرض للمراجع لا أن يُخفى.
export const UNCERTAINTY_LABELS_AR: Record<"low" | "medium" | "high", string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
};

// G2 — حالة نسخة التقرير تُعرض بالعربية دائمًا، لا بقيمتها التقنية.
export const REPORT_VERSION_STATUS_LABELS_AR: Record<ReportVersionStatus, string> = {
  draft: "مسودة",
  finalized: "معتمدة",
  superseded: "مستبدلة",
  stale: "قديمة",
};

export const FINDING_STATUS_LABELS_AR: Record<FindingStatus, string> = {
  achieved: "متحقق",
  partially_achieved: "متحقق جزئيًا",
  not_achieved: "غير متحقق",
  needs_clarification: "يحتاج توضيحًا",
  not_reviewable: "غير قابل للمراجعة",
  not_applicable: "غير منطبق",
};

export const FINDING_SEVERITY_LABELS_AR: Record<FindingSeverity, string> = {
  action_required_before_goal_approval: "معالجة لازمة قبل اعتماد الهدف",
  major_plan_gap: "فجوة جوهرية في الخطة",
  quality_improvement: "تحسين جودة",
  guidance_note: "ملاحظة إرشادية",
  no_judgment: "لا حكم",
};

export const HUMAN_DECISION_LABELS_AR: Record<HumanDecision, string> = {
  accept: "اعتماد",
  modify: "تعديل",
  reject: "رفض",
  request_more_information: "طلب معلومات",
  defer: "تأجيل",
};

export const DOMAIN_LABELS_AR: Record<string, string> = {
  D0: "قابلية المراجعة",
  D1: "بنية الهدف",
  D2: "التخصيص وقاعدة الأدلة",
  D3: "القيمة التعليمية/الوظيفية",
  D4: "الدعم والتنفيذ",
  D5: "الأسرة والمتعلم والسياق",
  D6: "المواءمة العمرية والمآلات",
  D7: "ترابط الأهداف",
  D8: "جاهزية الرصد",
};

export const REVIEW_GATE_LABELS_AR: Record<string, string> = {
  case_not_found: "الحالة غير موجودة.",
  case_closed_read_only: "الحالة مغلقة — عرض للقراءة فقط.",
  scope_not_confirmed: "لم يُؤكَّد نطاق المراجعة بعد.",
  scope_needs_reconfirmation: "النطاق يحتاج إلى إعادة تأكيد.",
  extraction_not_confirmed: "تأكيد الأدلة لم يكتمل بعد.",
  identity_conflict_unresolved: "تعارض هوية لم يُقرَّ بعد.",
  no_confirmed_evidence_and_no_not_reviewable:
    "لا توجد أدلة مؤكدة ولا معايير قابلة للعرض.",
};
// Arabic reasons shown next to every disabled report action.
export const REPORT_GATE_LABELS_AR: Record<string, string> = {
  case_not_found: "الحالة غير موجودة.",
  no_review_version: "لم تُشغَّل المراجعة بعد.",
  review_not_completed: "المراجعة المهنية لم تُختم بعد.",
  review_stale: "نسخة المراجعة قديمة — أعد تشغيل المحرك.",
  scope_needs_reconfirmation: "نطاق المراجعة يحتاج إعادة تأكيد.",
  extraction_not_confirmed: "تأكيد الأدلة لم يكتمل بعد.",
  identity_conflict_unresolved: "تعارض هوية لم يُقرَّ بعد.",
  critical_findings_pending: "توجد ملاحظات حرجة بدون قرار مراجع.",
  evidence_drift_detected: "تغيّرت الأدلة المؤكدة بعد تشغيل المحرك.",
  case_closed_read_only: "الحالة مغلقة — عرض للقراءة فقط.",
};

// Route each gate reason to the screen that resolves it.
export const GATE_REASON_TARGET_STEP_AR: Record<string, { hrefSuffix: string; labelAr: string }> = {
  no_review_version: { hrefSuffix: "/review", labelAr: "الانتقال إلى المراجعة المهنية" },
  review_not_completed: { hrefSuffix: "/review", labelAr: "الانتقال إلى المراجعة المهنية" },
  review_stale: { hrefSuffix: "/review", labelAr: "إعادة تشغيل المحرك في المراجعة" },
  critical_findings_pending: { hrefSuffix: "/review", labelAr: "استكمال قرارات المراجع" },
  evidence_drift_detected: { hrefSuffix: "/review", labelAr: "إعادة تشغيل المحرك في المراجعة" },
  scope_needs_reconfirmation: { hrefSuffix: "/scope", labelAr: "الانتقال إلى نطاق المراجعة" },
  extraction_not_confirmed: { hrefSuffix: "/extraction", labelAr: "الانتقال إلى استخراج الأدلة" },
  identity_conflict_unresolved: { hrefSuffix: "/extraction", labelAr: "معالجة تعارض الهوية" },
};
