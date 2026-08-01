# حزمة البرمجة الأولى لـ HIMAM

## Package 1A — Foundation, Review Case, Knowledge Loader, Gate 0

**نوع المستند:** أمر تنفيذ واحد شامل يُنقل إلى مشروع HIMAM في Lovable
**النسخة:** 1.0
**حدود التنفيذ:** المرحلة A فقط
**الحالة المرجعية:** CONDITIONAL GO
**المرجع الحاكم:** `HIMAM_PreProgramming_Package_v1.0`

# الأمر التنفيذي الجاهز للنسخ إلى Lovable

نفّذ الآن **حزمة البرمجة الأولى فقط** من HIMAM تحت الاسم:

> **HIMAM Package 1A — Foundation, Review Case, Knowledge Loader, Gate 0**

لا تبدأ Package 1B أو الاستخراج بالذكاء الاصطناعي أو تشغيل معايير المراجعة أو توليد التقرير. هذه الجولة تبني الأساس التقني الذي ستقرأ منه الحزم التالية قواعدها المعرفية دون أن تُكتب المعرفة التربوية بصورة مبعثرة داخل الكود.

## 1. مصادر الحقيقة الملزمة

استخدم حزمة ما قبل البرمجة التالية بوصفها مصدر الحقيقة:

```text
/himam-preprogramming-package-v1.0/
```

الملفات الأساسية لهذه الجولة:

```text
00_README.md
01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md
02_HIMAM_KNOWLEDGE_FRAMEWORK.md
03_HIMAM_CRITERIA_MATRIX.csv
04_HIMAM_SOURCE_REGISTER.csv
05_HIMAM_INPUT_ACTIVATION_MATRIX.csv
09_HIMAM_DECISION_LOGIC.md
13_HIMAM_ACCEPTANCE_CRITERIA.md
14_HIMAM_OUT_OF_SCOPE_REGISTER.md
15_HIMAM_PROGRAMMING_HANDOFF.md
16_HIMAM_SAFETY_GATE_CHECKLIST.md
17_HIMAM_TRACEABILITY_MATRIX.csv
18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md
MANIFEST.md
```

قواعد ملزمة:

- لا تنسخ القواعد التربوية إلى شروط متناثرة داخل مكونات الواجهة.
- ملفات المعرفة هي `read-only, versioned knowledge assets`.
- لا تعدّل ملفات حزمة المعرفة في هذه الجولة.
- احتفظ بإصدار الحزمة المستخدم داخل كل `ReviewCase`.
- شغّل `npm run validate:himam-package` قبل التنفيذ وبعده ويجب أن ينتهي بـ exit code 0.

## 2. هوية المنتج غير القابلة للتغيير

HIMAM محرك مساندة إشرافية لمراجعة جودة قرارات خطة تعليمية فردية وفق المدخلات المتاحة.

وحدة العمل هي `ReviewCase` لخطة واحدة في زمن واحد.

ممنوع في هذه الجولة:

- `Student Master Record`.
- ملف متعلم دائم أو ربط تلقائي بين الحالات.
- التشخيص أو الأهلية.
- كتابة الخطة.
- إدارة الخدمات أو الموضع.
- متابعة التنفيذ أو جمع بيانات التقدم.
- حكم قانوني.
- درجة كلية واحدة للخطة.
- تشغيل AI.
- تشغيل معايير المراجعة أو إصدار `ReviewFinding`.
- توليد تقرير مراجعة.

لا تضف كيانًا دائمًا باسم `Student` أو `LearnerProfile`. العمر والمرحلة يخزنان داخل `ReviewCase` فقط.

## 3. الهدف الوظيفي للحزمة

بنهاية الجولة يجب أن يستطيع المستخدم:

1. فتح لوحة حالات المراجعة.
2. إنشاء حالة جديدة.
3. إدخال العمر أو المرحلة.
4. تسجيل ملف الخطة كمصدر إلزامي أول.
5. رؤية اكتمال الحد الأدنى.
6. رؤية نطاق مبدئي يوضح المتاح وغير القابل للمراجعة.
7. حفظ الحالة والعودة إليها.
8. رؤية الاستخراج والمراجعة والتقرير كخطوات مقفلة للحزم التالية.

## 4. الفحص الأولي للمشروع

- افحص إطار الواجهة والمسارات والتخزين الحالي.
- أعد استخدام Supabase الحالي إن وجد.
- لا تنشئ مشروع Supabase جديدًا.
- لا تستبدل التصميم أو المصادقة.
- لا تغيّر الهوية البصرية العامة.
- لا تحذف مسارات أو جداول قائمة.
- اعزل هذه الحزمة في feature مستقلة إذا وجدت نماذج قديمة متعارضة.

التخزين:

- إن وجد Supabase: migration محدودة وآمنة.
- إن لم يوجد backend مستقر: `ReviewCaseRepository` interface مع `LocalReviewCaseRepository` مؤقت قابل للاستبدال.

## 5. محمّل المعرفة Knowledge Loader

أنشئ:

```text
src/features/himam/knowledge/
├── knowledge-loader.ts
├── knowledge-types.ts
├── knowledge-version.ts
└── knowledge-validation.ts
```

الوظائف:

```ts
type KnowledgeManifest = {
  packageName: string;
  version: string;
  readiness: "GO" | "CONDITIONAL_GO" | "NO_GO";
  openIssues: string[];
};
```

- `loadKnowledgeManifest()` يقرأ `MANIFEST.md` و`18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md`.
- `loadCriteriaIndex()` يقرأ الملف 03 إلى بنية typed، ويتحقق من uniqueness ومن المجالات D0-D8 فقط، من دون تشغيل المعايير.
- `loadInputActivationMatrix()` يقرأ الملف 05.
- `getReviewScope(inputs)` ينتج نطاقًا أوليًا فقط.

```ts
type ReviewInputType =
  | "age_phase"
  | "plan"
  | "assessment"
  | "family_priorities"
  | "student_preferences"
  | "supports"
  | "professional_notes"
  | "prior_plan"
  | "prior_progress";

type ScopeItemStatus = "available" | "not_reviewable" | "not_applicable";
```

Gate 0:

- العمر/المرحلة + الخطة يتيحان نطاقًا أساسيًا.
- غياب مدخل اختياري = `not_reviewable`.
- لا تستخدم `failed` أو `not_met` بسبب غياب المدخل.
- لا توجد severity في نطاق التفعيل.
- لا تعرض HLP في الواجهة.
- أضف تذكيرًا غير مانع:

```text
OPEN-REF-01
توثيق مصادر HLP الأولية قبل عرضها كمرجعيات خارجية للمستخدم.
status = deferred_non_blocking
```

## 6. نموذج البيانات الأدنى

```ts
type ReviewCaseStatus = "draft" | "minimum_inputs_complete" | "scope_confirmed" | "closed";

type ReviewCase = {
  id: string;
  referenceCode: string;
  ageYears: number | null;
  phaseId: string | null;
  planType: string | null;
  status: ReviewCaseStatus;
  knowledgePackageVersion: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};
```

```ts
type InputSourceType =
  | "plan"
  | "assessment"
  | "family_priorities"
  | "student_preferences"
  | "supports"
  | "professional_notes"
  | "prior_plan"
  | "prior_progress";

type InputSourceStatus =
  | "registered"
  | "file_missing"
  | "unreadable"
  | "ready_for_future_ingestion";

type InputSource = {
  id: string;
  reviewCaseId: string;
  type: InputSourceType;
  fileName: string;
  mimeType: string | null;
  storagePath: string | null;
  sourceDate: string | null;
  status: InputSourceStatus;
  createdAt: string;
};
```

```ts
type ReviewScopeSnapshot = {
  id: string;
  reviewCaseId: string;
  knowledgePackageVersion: string;
  availableDomains: string[];
  notReviewableDomains: string[];
  notApplicableDomains: string[];
  inputTypes: ReviewInputType[];
  confirmedAt: string | null;
  createdAt: string;
};
```

```ts
type AuditEvent = {
  id: string;
  reviewCaseId: string;
  eventType:
    | "case_created"
    | "case_updated"
    | "source_registered"
    | "source_removed"
    | "scope_generated"
    | "scope_confirmed"
    | "case_closed";
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};
```

لا تنشئ الآن:
`Need, Baseline, Goal, ProgressMeasure, Support, FamilyPriority, StudentPreference, ExtractedEvidence, ReviewFinding, SupervisorDecision, ReportVersion, GoalRelationship`.

## 7. العمر والمرحلة

```text
early_intervention
preschool
elementary
middle
high_school
adult_transition
postsecondary_employment
```

- العمر 0-100.
- لا اسم ولا تاريخ ميلاد.
- لا استنتاج لقدرة المتعلم من العمر.
- عدم الاتساق بين العمر والمرحلة يظهر كتأكيد إدخال فقط.
- لا تفعيل انتقال بعمر ثابت.

## 8. ملف الخطة

المسموح: PDF وDOCX ونص عادي إن كانت البنية الحالية تدعمه.

في هذه الجولة:

- سجّل الملف وmetadata.
- تحقق من النوع والحجم.
- لا استخراج نص.
- لا OCR.
- لا AI.
- لا تقييم معرفي.
- لا نتائج مراجعة.

عند فشل الرفع:

```text
ReviewCase.status = draft
InputSource.status = file_missing أو unreadable
```

## 9. آلة الحالات

```text
draft → minimum_inputs_complete → scope_confirmed → closed
```

- الانتقال الأول يتطلب `(ageYears أو phaseId) + plan ready_for_future_ingestion`.
- الانتقال الثاني يتطلب نطاقًا مولدًا من الملف 05 وتأكيد المستخدم.
- الإغلاق يدوي فقط.
- ممنوع تخطي الحالات أو الانتقال إلى extraction/review/report/approved.

## 10. الشاشات

1. لوحة حالات المراجعة.
2. إنشاء حالة: العمر، المرحلة، نوع الخطة، ملف الخطة، معرف مرجعي اختياري.
3. مصادر المراجعة: الخطة إلزامية، وبقية المصادر مقفلة للحزمة التالية.
4. نطاق المراجعة المبدئي.
5. ملخص الحالة وخطوات الاستخراج والمراجعة والتقرير مقفلة.

اعرض النصين:

> هذه ليست نتائج مراجعة. إنها حدود المراجعة التي ستصبح ممكنة بعد تنفيذ الحزم التالية.

> لم تُنفذ مراجعة الخطة بعد.

## 11. الهيكل والخدمات

```text
src/features/himam/
├── cases/
├── sources/
├── scope/
├── knowledge/
└── audit/
```

الخدمات المسموحة:
`CaseService, SourceService, KnowledgeLoader, ScopeService, AuditService`.

لا تنشئ:
`ExtractionService, ReviewEngine, RelationshipService, ReportAssemblyService, AIService`.

## 12. الخصوصية

- لا اسم.
- لا معرف متعلم دائم.
- لا ربط بين الحالات.
- تحقق من النوع والحجم.
- تخزين خاص بلا public URLs.
- Audit trail.
- لا طباعة لمحتوى الملفات.
- لا إرسال إلى AI.

## 13. اختبارات Package 1A

أنشئ PKG1A-T01 إلى PKG1A-T12 لتغطية:

- غياب العمر/المرحلة.
- غياب الخطة.
- اكتمال الحد الأدنى.
- غياب التقييم = `not_reviewable`.
- غياب الأسرة = `not_reviewable`.
- الابتدائي لا يفرض انتقالًا.
- إنشاء Scope Snapshot.
- رفض تخطي state.
- إغلاق الحالة بلا تقرير.
- تحميل 55 معيارًا فريدًا ضمن D0-D8.
- عدم وجود Student أو AI أو خدمات أو متابعة.

اربطها بالحالات المرجعية:
`TC01, TC04, TC09, TC23, TC24, TC25, TC41`.

## 14. Definition of Done

- `npm run validate:himam-package` ينجح.
- build وtypecheck وlint والاختبارات تنجح.
- إنشاء الحالة وحفظها واستعادتها يعمل.
- العمر/المرحلة + الخطة هما الحد الأدنى.
- غياب المدخل الاختياري = not_reviewable.
- Scope Snapshot من الملف 05 لا من شروط hardcoded.
- إصدار المعرفة محفوظ.
- لا AI ولا extraction ولا findings ولا report.
- لا Student Master Record.
- لا تغيير بصري عام.
- PKG1A-T01 إلى T12 ناجحة.
- Audit events تعمل.
- الملفات خاصة.
- لا انتقال تلقائي للحزمة التالية.

## 15. لا تنفذ

لا استخراج، لا تحليل PDF/DOCX، لا OCR، لا ربط حاجة بهدف، لا تشغيل معايير، لا Findings، لا ترابط أهداف، لا توصيات، لا تقرير، لا نسبة كلية، لا AI، لا خدمات، لا أهلية، لا تشخيص، ولا توثيق HLP الخارجي.

## 16. الرد النهائي المطلوب

أرسل فقط:

1. الملفات المعدلة.
2. طبقة التخزين.
3. الشاشات والمسارات.
4. نتائج validate/typecheck/lint/build/tests.
5. إثبات عدم وجود Student Master Record أو AI أو نتائج مراجعة.
6. القضايا المفتوحة.
7. Commit SHA.
8. `PACKAGE 1A PASSED` أو `PACKAGE 1A FAILED`.

لا تبدأ الحزمة التالية، ولا تنشر المشروع، وانتظر الاعتماد.
