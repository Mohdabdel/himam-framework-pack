# 15 — التسليم البرمجي

## المراحل

- المرحلة A — Foundation: نموذج البيانات + بوابات القراءة + إنشاء الحالة.
- المرحلة B — Ingestion & Extraction: تسجيل المصادر، الاستخراج بمساعدة AI، تأكيد المشرف.
- المرحلة C — Review Engine: تفعيل المعايير، إصدار ReviewFinding، بوابات القرار.
- المرحلة D — Report & Governance: تركيب التقرير، توقيع النسخة، Safe Stop، provenance.
- المرحلة E — Test Harness & Release: تشغيل 20+ حالة مرجعية، بوابة السلامة، إصدار v1.0.

## نموذج البيانات الأدنى

- ReviewCase(id, age, phase, created_at, closed_at, status)
- InputSource(id, case_id, type, uploaded_at, meta)
- ExtractedEvidence(id, source_id, quote, location, confidence, confirmed_by, confirmed_at)
- Need(id, case_id, text, evidence_refs[])
- Baseline(id, case_id, goal_id, value, unit, source_refs[])
- Goal(id, case_id, text, conditions, criterion, timeframe, measure_id)
- ProgressMeasure(id, goal_id, tool, frequency, observer, decision_rule)
- Support(id, case_id, description, related_goal_ids[])
- FamilyPriority(id, case_id, text)
- StudentPreference(id, case_id, text)
- AgePhaseOutcome(id, phase_id, outcome_text)
- GoalRelationship(id, from_goal_id, to_goal_id, relation)
- ReviewCriterion(id, domain_id, activation_rule, ...) // من الملف 03
- ReviewFinding(id, case_id, criterion_id, status, severity, evidence_refs[], message, recommendation, ai_confidence, provenance)
- SupervisorDecision(id, finding_id, action, note, actor, at)
- ReportVersion(id, case_id, version, hash, signed_by, signed_at, payload)

## الخدمات المنطقية

CaseService, IngestionService, ExtractionService (AI), CriteriaActivationService,
ReviewEngine, RelationshipService, ReportAssemblyService, GovernanceService, TestHarness.

## الشاشات

1. لوحة الحالات (قائمة).
2. إنشاء حالة (العمر + الخطة).
3. رفع المصادر.
4. شاشة تأكيد الاستخراج.
5. شاشة نتائج المراجعة حسب المجال.
6. شاشة الملاحظات والتوصيات.
7. شاشة معاينة التقرير.
8. شاشة اعتماد النسخة.
9. شاشة حالات الاختبار (للأدمن).

## حالات النظام (State Machine للحالة)

draft → sources_registered → extraction_confirmed → review_complete → report_drafted → report_approved → closed.

## قواعد النسخ

- كل اعتماد يرفع version بمقدار 1.
- لا كتابة فوق النسخة المعتمدة.
- كل نسخة تحمل hash لمحتوى التقرير.

## Definition of Done

- كل معيار في الملف 03 له اختبار واحد على الأقل.
- 100% من الحالات المرجعية تعطي المخرجات المتوقعة.
- لا اقتراح AI بلا provenance.
- بوابة السلامة (الملف 16) مجتازة.
