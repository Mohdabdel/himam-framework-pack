# HIMAM Framework Pack

أنشئ مشروعًا خاصًا بسيطًا باللغة العربية RTL باسم «HIMAM Pre‑Programming Package v1.0». الغرض الوحيد: إنتاج حزمة ZIP قابلة للتنزيل تحتوي على الملفات المعرفية والتشغيلية الكاملة قبل برمجة محرك HIMAM. لا تنشئ قاعدة بيانات ولا مصادقة ولا أي نظام لإدارة متعلم.

هوية HIMAM الحاكمة:
HIMAM محرك مساندة إشرافية لمراجعة جودة قرارات الخطة التعليمية الفردية وفق المدخلات المتاحة. وحدة العمل Review Case وليست Student Master Record. الحد الأدنى: العمر/المرحلة + نموذج الخطة. المصادر الاختيارية: التقييم، أولويات الأسرة، تفضيلات المتعلم، الدعم والتسهيلات، ملاحظات مهنية، خطة سابقة، بيانات تقدم سابقة. كل مدخل يفعّل وحدات مراجعة محددة؛ غياب المدخل = غير قابل للمراجعة وليس فشلًا. الذكاء الاصطناعي يستخرج ويقارن ويقترح، والمشرف يعتمد.

المرجعيات المعرفية المتاحة من مرحلة الاطلاع:
- إطار جودة الهدف: 15 بعدًا تشمل مواءمة الحاجة، خط الأساس، تحديد السلوك، القياس، الملاحظة، الشروط، الإتقان، الزمن، القيمة التعليمية والوظيفية، الجدوى، اتساق الدعم، الملاءمة الثقافية والسياقية، الانتقال عند الانطباق، رصد التقدم، والمتطلبات التنظيمية عند تهيئتها. يميز بين معايير أساسية، تحسين جودة، ومشروطة. الدرجة العالية لا تتجاوز فشلًا جوهريًا. يرتبط بالممارسات عالية التأثير HLP 4 و5 و6 و11 و12 و13 و15، لكن بيانات المصادر الأولية الدقيقة يجب أن تسجل Needs Verification.
- إطار مكونات الخطة: سلسلة قائمة مصادر التقييم→توليف التقييم→الأداء الحالي/PLAAFP→الاحتياجات ذات الأولوية→خط الأساس→الهدف→مواصفة القياس؛ ويدعم التصميم التعليمي المنهجي، التعميم والصيانة، مواءمة الدعم، وجاهزية الرصد. المعمارية الشاملة للخدمات والتنفيذ والحوكمة خارج نطاق HIMAM.
- نموذج الصلاحية والجودة: فصل Evidence Validity وStructural/Goal Quality وEducational Coherence وImplementation Readiness وOutcome Accountability بدل رقم واحد؛ العلاقات Goal→Need, Goal→Baseline, Goal→Measure, Need→Evidence؛ حوكمة AI تمنع التشخيص والأهلية وتحديد الحاجة والموضع والخدمة والحكم القانوني المستقل، وتفرض المصدرية والمراجعة البشرية.
- إطار المراحل: U عام، A متكيف، C مشروط، P أولوية مرحلية. التدخل المبكر أسري وروتيني؛ ما قبل المدرسة مشاركة نمائية؛ الابتدائي أسس أكاديمية وتواصل واستقلال؛ المتوسط صوت المتعلم والوعي بالذات والتخطيط المبكر؛ الثانوي والانتقال تقرير المصير والمسارات والمجتمع والعمل والعيش المستقل؛ الرشد مشاركة وعمل وتعلم مستمر وجودة حياة. العمر يحدد أولوية التفكير لا القدرة ولا يولد هدفًا.

أنشئ داخل المشروع محتوى حقيقيًا كاملاً، لا placeholders، للملفات التالية، ثم اجعل زر «تنزيل الحزمة الكاملة» ينشئ ZIP في المتصفح باستخدام JSZip. يجب أن يحتوي ZIP على مجلد HIMAM_PreProgramming_Package_v1.0 وهذه الملفات بترميز UTF‑8، وCSV قابلة للفتح عربيًا:

00_README.md
01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md
02_HIMAM_KNOWLEDGE_FRAMEWORK.md
03_HIMAM_CRITERIA_MATRIX.csv
04_HIMAM_SOURCE_REGISTER.csv
05_HIMAM_INPUT_ACTIVATION_MATRIX.csv
06_HIMAM_AGE_PHASE_OUTCOMES.csv
07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md
08_HIMAM_REVIEW_PROCESSES.md
09_HIMAM_DECISION_LOGIC.md
10_HIMAM_REPORT_CONTRACT.md
11_HIMAM_AI_GOVERNANCE.md
12_HIMAM_REFERENCE_TEST_CASES.csv
13_HIMAM_ACCEPTANCE_CRITERIA.md
14_HIMAM_OUT_OF_SCOPE_REGISTER.md
15_HIMAM_PROGRAMMING_HANDOFF.md
16_HIMAM_SAFETY_GATE_CHECKLIST.md
MANIFEST.md

المحتوى الإلزامي:
1) الهوية والنطاق: تعريف المنتج، المشكلة، المستخدم الأساسي، Review Case، المدخلات، المجالات التسعة، داخل/خارج النطاق، المحظورات المعمارية، حالات الحكم، مبادئ السلامة.
2) الإطار المعرفي: سلسلة Source→Evidence→Interpretation→Need→Current Performance/Baseline→Goal→Measure→Support→Age/Functional Outcome؛ فصل معلومات المصدر والاستخراج والتفسير والقرار؛ المجالات التسعة: D0 قابلية المراجعة، D1 بنية الهدف، D2 التخصيص وقاعدة الأدلة، D3 القيمة والجدوى، D4 الدعم والتنفيذ، D5 الأسرة والمتعلم والسياق والإنصاف، D6 المواءمة العمرية والمآلات، D7 ترابط الأهداف، D8 جاهزية الرصد.
3) مصفوفة المعايير: CSV شاملة لا تقل عن 50 معيارًا، بأعمدة: criterion_id,domain_id,criterion_name_ar,review_level,criterion_type,required_inputs,activation_rule,not_reviewable_rule,not_applicable_rule,review_question,evidence_expected,comparison_objects,status_options,default_severity_if_failed,human_confirmation,source_ids,source_strength,report_message_template,recommendation_template,limitations. غطِّ بنية الهدف، الحاجة والتقييم والخط الأساسي، القيمة، الدعم، الأسرة والمتعلم، العمر والمآلات، ترابط الأهداف، والرصد. حالات الحكم: متحقق، متحقق جزئيًا، غير متحقق، يحتاج توضيحًا، غير قابل للمراجعة، غير منطبق.
4) سجل المصادر: مصادر user-provided secondary syntheses، ومداخل HLP 3,4,5,6,11,12,13,15 مع Needs Verification للمصدر الأولي، وقواعد حوكمة داخلية، ومرجع ولاية مشروط غير مفعّل. أعمدة المصدرية الكاملة مع evidence_strength وverification_status وlimitations. لا تخترع روابط أو تفاصيل ببليوغرافية غير موجودة.
5) مصفوفة التفعيل: العمر، الخطة، التقييم، الأسرة، المتعلم، الدعم، الخطة السابقة، التقدم السابق، التقرير المهني؛ ما الوحدات التي تفعّلها والأحكام المحظورة عند الغياب وقاعدة تقليل البيانات.
6) المراحل والمآلات: جدول U/A/C/P للمكونات عبر Early intervention, Preschool, Elementary, Middle, High school, Adult transition, Postsecondary/employment، وإطار مآلات عربي لكل مرحلة. العمر يحدد أولوية التفكير لا القدرة ولا يولد هدفًا.
7) ترابط الأهداف: العلاقات builds_on, prepares_for, integrates_with, generalizes_to, increases_independence_in, duplicates, conflicts_with, unlinked؛ التدرج، القيمة التوليدية، التعميم، الصيانة، مع ضوابط عدم فرض تسلسل خطي.
8) العمليات: P01-P15 من إنشاء الحالة وتسجيل المصادر وفحصها وتحديد نطاق المراجعة والاستخراج والتأكيد وبناء العلاقات وتفعيل المعايير ومراجعة الهدف والخطة وتوليد النتائج ومراجعة المشرف وتركيب التقرير واعتماد النسخة وإغلاق الحالة.
9) منطق القرار: شجرة الانطباق→توفر المدخل→الحكم؛ فصل status عن severity؛ بوابات G0-G5؛ عدم تجاوز الفشل الجوهري بالدرجات؛ لا نسبة كلية وحيدة في MVP.
10) عقد التقرير: الأقسام الإلزامية، ReviewFinding contract، قواعد اللغة، المصدرية، نسخة التقرير.
11) حوكمة AI: وظائف مسموحة ومحظورة، provenance fields، hallucination controls، مستويات الثقة، human review، privacy، testing، safe stop.
12) حالات اختبار: CSV لا يقل عن 20 حالة مرجعية تشمل الخطة فقط، هدف غامض، نشاط بدل هدف، هدف جيد بلا تقييم، تقييم يدعم الهدف، هدف غير مدعوم، اختلاف وحدة القياس، أولوية الأسرة، غيابها، هدف طفولي لمراهق، أهداف غير مترابطة، قفزة مهارية، تعارض AAC، ملاحظة بلا بروتوكول، غياب قاعدة القرار، اسم متعلم آخر، تكرار خطة سابقة، تعارض مصادر، هدف طاعة، محتوى AI غير مدعوم. أعمدة النتائج المتوقعة والأفعال المحظورة وشروط النجاح.
13) معايير القبول: الهوية، المعرفة، المصدرية، الاستخراج، القرار، التقرير، AI، الخصوصية، الاختبارات، الأدوار الموقعة.
14) خارج النطاق: سجل واضح لـ Student Master Record، التشخيص، كتابة الخطة كاملة، الخدمات، متابعة التنفيذ، جمع بيانات التقدم، الحكم القانوني العام، الاجتماعات، النزاعات، التحليلات التنبؤية، تقييم الموظفين، الدرجة الواحدة.
15) التسليم البرمجي: مراحل A-E، نموذج البيانات الأدنى ReviewCase/InputSource/ExtractedEvidence/Need/Baseline/Goal/ProgressMeasure/Support/FamilyPriority/StudentPreference/AgePhaseOutcome/GoalRelationship/ReviewCriterion/ReviewFinding/SupervisorDecision/ReportVersion، الخدمات المنطقية، الشاشات، حالات النظام، قواعد النسخ، Definition of Done.
16) بوابة السلامة: G1-G12 مع checkboxes وشروط GO/CONDITIONAL GO/NO-GO، وتشمل الهوية، المعرفة، المعايير، المرجعيات، التفعيل، العمر، الترابط، العمليات والتقرير، AI، الخصوصية، الاختبار، التسليم.

الواجهة: صفحة واحدة نظيفة جدًا RTL، عنوان، وصف قصير، قائمة الملفات، عداد 16 ملفًا أساسيًا + README + Manifest، زر تنزيل ZIP، زر تنزيل كل ملف منفردًا، وإظهار حالة «جاهزة للمراجعة قبل البرمجة». لا تضف أي خصائص أخرى. اجعل المشروع خاصًا وغير منشور. راجع أن كل ملف غير فارغ وأن CSV تستخدم BOM UTF‑8 وأن ZIP يفتح بنجاح.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b002fced-bdc9-48ab-a6f0-99b19d227228).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
