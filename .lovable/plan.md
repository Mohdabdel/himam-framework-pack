# ملحق تنفيذي — تحسين واجهات الإدخال ورحلة المراجعة

## نطاق العمل
تحسينات واجهة فقط ضمن جولة 1C.3 الحالية — بدون قاعدة بيانات جديدة، بدون AI، بدون كسر نماذج البيانات القائمة. الحد الأدنى يبقى: (ملف الخطة) + (العمر أو المرحلة).

## الملفات الرئيسية للتعديل / الإنشاء

### 1) قاموس التسميات المركزي (توسعة)
- `src/features/himam/cases/case-labels.ts`
  - أضف `SOURCE_STATUS_LABELS_AR`, `SCOPE_STATUS_LABELS_AR`, `JOURNEY_STAGE_LABELS_AR`, `REVIEW_FINDING_STATUS_LABELS_AR` (إعادة تصدير)، `INPUT_IMPACT_TEXTS`
  - دالة `journeyStageStatus(caseData): JourneyStepState` لكل مرحلة من 8 مراحل

### 2) خدمة أثر المدخلات (منطق عرض فقط — لا تلمس المحرك)
- `src/features/himam/scope/input-impact.ts` (جديد)
  - `describeInputImpact(sourceType)` → عنوان/حالة/أثر عند الإضافة/أثر عند الغياب
  - `computeProvisionalScope(caseId)` — يستخدم `getReviewScope` القائم على المصادر المسجّلة، بدون تخزين
  - `countScopeBuckets(scope)` → available/not_reviewable/not_applicable
  - `expandableSources(scope)` → المصادر التي إن أضيفت ستنقل معايير من not_reviewable إلى available

### 3) شاشة إنشاء الحالة
- `src/routes/cases.new.tsx`
  - نص توضيحي: "الحد الأدنى: ملف الخطة + (العمر أو المرحلة)"
  - تنبيه تعارض عمر/مرحلة **غير مانع**
  - نص التشخيص: "لا يشترط…"

### 4) شاشة المصادر (المرحلة 2)
- `src/routes/cases.$caseId.sources.tsx`
  - إعادة تصميم: بطاقة لكل مصدر (8 بطاقات) تعرض: الاسم، إلزامي/اختياري، هل أضيف، الأثر عند الإضافة، الأثر عند الغياب، حالة النص، زر الإضافة/الاستبدال
  - مكون جانبي `ScopeImpactSummary`: عدّاد available/not_reviewable/not_applicable + قائمة "مصادر يمكن أن توسع النطاق" + نص محايد
  - إزالة أي لغة "مفقود/ناقص/فاشل"

### 5) صفحة الحالة — Stepper موحّد
- `src/routes/cases.$caseId.tsx`
  - مكون `CaseJourneyStepper` بـ 8 خطوات مرقمة عربيًا (بيانات أساسية، مصادر، تجهيز نصوص، تأكيد أدلة، تأكيد نطاق، مراجعة مهنية، تقرير، إغلاق)
  - لكل خطوة: حالة (لم تبدأ/قيد التنفيذ/مكتملة/تحتاج إجراء/تحتاج تحديثًا/للقراءة فقط) + سبب عدم الجاهزية + رابط مباشر
  - إزالة أي ذكر لأسماء Package 1A/1B/1C من واجهة المستخدم

### 6) شاشات المسار (تنقل موحّد)
- `src/routes/cases.$caseId.ingestion.tsx`
- `src/routes/cases.$caseId.extraction.tsx`
- `src/routes/cases.$caseId.review.tsx`
- `src/routes/cases.$caseId.report.tsx`
  - مكون رأس مشترك جديد `src/features/himam/ui/StageHeader.tsx`: عنوان، وصف، المطلوب الآن، مؤشر المرحلة، حالة الحفظ
  - مكون تذييل مشترك `src/features/himam/ui/StageFooter.tsx`: أزرار "السابق"، "العودة إلى حالة المراجعة"، "حفظ ومتابعة" مع tooltip لسبب التعطيل
  - "تأكيد النطاق النهائي" يعرض مقارنة النطاق المبدئي بالنهائي داخل شاشة المراجعة أو خطوة مستقلة داخل الاستخراج (حسب الموجود حاليًا) — سنستخدم قسمًا داخل شاشة الاستخراج بعد اكتمال تأكيد الأدلة، دون إنشاء route جديد

### 7) شاشة التقرير
- `src/routes/cases.$caseId.report.tsx`
  - قسم جديد "المدخلات المتاحة وغير المتاحة وأثرها" — للعرض فقط، مبني من `describeInputImpact` + نطاق التقرير الحالي
  - التأكد أن `not_reviewable` في قسم مستقل ولا يُعامل كفجوة

### 8) الاختبارات
- `src/features/himam/__tests__/ux-flow.test.ts` (جديد) — 15 اختبار UX-FLOW-T01..T15، أغلبها منطقي على `describeInputImpact`, `computeProvisionalScope`, `journeyStageStatus`، مع فحوصات نصية على وحدة التسميات (لا تظهر قيم خام).

## قيود مثبّتة
- لا AI حي، لا OCR، لا درجة جودة كلية
- لا تعديل على `deterministic-review-engine`, `governed-report-service`, نماذج البيانات
- `not_reviewable` منفصل عن `not_achieved` (موجود؛ سنؤكد بالاختبار)
- لا تأكيد نطاق متكرر عند إضافة كل مصدر — النطاق المبدئي معلوماتي فقط

## معيار الإكمال
جميع الاختبارات القائمة (100) + 15 اختبار UX-FLOW جديد ناجحة، Typecheck/Lint/Build نظيفة.