# HIMAM Pre-Programming Package v1.0

هذه الحزمة هي المرجع المعرفي والتشغيلي الكامل الواجب اعتماده قبل الشروع في برمجة محرك HIMAM.
الغرض: تجميد القرارات المعرفية والحوكمية والوظيفية بحيث تصبح البرمجة تنفيذًا لعقد واضح لا اجتهادًا.

## هوية HIMAM الحاكمة

HIMAM محرك مساندة إشرافية لمراجعة جودة قرارات الخطة التعليمية الفردية وفق المدخلات المتاحة.
وحدة العمل: Review Case وليست Student Master Record.
الحد الأدنى للتشغيل: العمر/المرحلة + نموذج الخطة.
كل مدخل يفعّل وحدات مراجعة محددة؛ غياب المدخل = غير قابل للمراجعة وليس فشلًا.
status منفصل عن severity، ونتيجة الهدف منفصلة عن نتيجة الخطة.
الذكاء الاصطناعي: يستخرج ويقارن ويقترح فقط. المشرف: يعتمد.

## قائمة الملفات (21 ملفًا)

00_README.md — هذا الملف
01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md — الهوية والنطاق
02_HIMAM_KNOWLEDGE_FRAMEWORK.md — الإطار المعرفي والمجالات التسعة
03_HIMAM_CRITERIA_MATRIX.csv — مصفوفة معايير المراجعة
04_HIMAM_SOURCE_REGISTER.csv — سجل المصادر والمرجعيات
05_HIMAM_INPUT_ACTIVATION_MATRIX.csv — مصفوفة تفعيل المدخلات
06_HIMAM_AGE_PHASE_OUTCOMES.csv — المراحل العمرية والمآلات
07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md — إطار ترابط الأهداف
08_HIMAM_REVIEW_PROCESSES.md — العمليات التشغيلية P01-P15
09_HIMAM_DECISION_LOGIC.md — منطق القرار والبوابات
10_HIMAM_REPORT_CONTRACT.md — عقد التقرير
11_HIMAM_AI_GOVERNANCE.md — حوكمة الذكاء الاصطناعي
12_HIMAM_REFERENCE_TEST_CASES.csv — حالات اختبار مرجعية (45+)
13_HIMAM_ACCEPTANCE_CRITERIA.md — معايير القبول
14_HIMAM_OUT_OF_SCOPE_REGISTER.md — سجل خارج النطاق
15_HIMAM_PROGRAMMING_HANDOFF.md — التسليم للبرمجة
16_HIMAM_SAFETY_GATE_CHECKLIST.md — بوابة السلامة G1-G12
17_HIMAM_TRACEABILITY_MATRIX.csv — مصفوفة التتبع (معيار ⇢ مصدر/مدخل/اختبار/تقرير/مكوّن)
18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md — تقرير الجاهزية الفعلي (G1-G12)
19_HIMAM_PROGRAMMING_PACKAGE_01_FOUNDATION_AR.md — حزمة البرمجة الأولى Package 1A (أمر تنفيذ)
MANIFEST.md — بيان الحزمة

## قواعد الاستخدام

- لا تعتمد الحزمة إلا بعد اجتياز بوابة السلامة (الملف 16) وقرار تقرير الجاهزية (الملف 18).
- أي تعديل بعد الاعتماد يتطلب رفع رقم الإصدار وإعادة توقيع الأدوار.
- الترميز UTF-8 لجميع الملفات؛ ملفات CSV تحمل BOM لضمان الفتح العربي.
- سكربت التحقق: `npm run validate:himam-package`.

الإصدار: 1.0 — الحالة: وفق تقرير الجاهزية (الملف 18).
