import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AppShell,
  WorkflowShell,
  CaseService,
  CollapsibleSection,
  DefaultDocumentTextExtractor,
  INPUT_IMPACTS,
  PROVISIONAL_SCOPE_DISCLAIMER_AR,
  computeProvisionalScope,
  countScopeBuckets,
  expandableSources,
  getDefaultPlanFileStorage,
  getDefaultRepository,
  IngestionService,
  MANUAL_TEXT_SOURCE_TYPES,
  ResponsivePanel,
  SINGLE_ACTIVE_SOURCE_TYPES,
  SOURCE_TYPE_LABELS_AR,
  SOURCE_TYPES_ORDER,
  EXTRACTION_STAGE_LABELS_AR,
  StageFooter,
  StageHeader,
  validatePlanFile,
} from "@/features/himam";
import type { InputImpactKey, InputSource, InputSourceType, ReviewCase, ReviewInputType } from "@/features/himam";

const SOURCE_TYPE_TO_IMPACT_KEY: Record<InputSourceType, InputImpactKey> = {
  plan: "plan",
  assessment: "assessment",
  family_priorities: "family_priorities",
  student_preferences: "student_preferences",
  supports: "supports",
  professional_notes: "professional_notes",
  prior_plan: "prior_plan",
  prior_progress: "prior_progress",
};

const SOURCE_TYPE_TO_REVIEW_INPUT: Record<InputSourceType, ReviewInputType> = {
  plan: "plan",
  assessment: "assessment",
  family_priorities: "family_priorities",
  student_preferences: "student_preferences",
  supports: "supports",
  professional_notes: "professional_notes",
  prior_plan: "prior_plan",
  prior_progress: "prior_progress",
};

// Short compact-card blurb (one line) for each optional source.
const OPTIONAL_SHORT_AR: Record<InputSourceType, string> = {
  plan: "",
  assessment: "يدعم مراجعة ارتباط الاحتياجات وخطوط الأساس والأهداف بنتائج التقييم.",
  family_priorities: "يدعم مراجعة حضور أولويات الأسرة واتساقها مع الخطة.",
  student_preferences: "يدعم مراجعة تمثيل صوت المتعلم وتفضيلاته.",
  supports: "يدعم مراجعة اتساق الدعم والتسهيلات مع الاحتياجات والأهداف.",
  professional_notes: "تضيف معلومات سياقية موثقة من المختصين.",
  prior_plan: "تدعم مراجعة الاستمرارية والتغير بين الخطط.",
  prior_progress: "تدعم مراجعة التقدم الموثق واستمرار الأهداف أو تعديلها.",
};

const GOVERNANCE_NOTE_AR =
  "عدم إضافة المصدر الاختياري لا يعني أن الخطة غير متحققة. ستظهر فقط المعايير التي تعتمد عليه بوصفها غير قابلة للمراجعة وفق المعلومات المتاحة.";
const OPTIONAL_INTRO_AR =
  "إضافة هذه المعلومات اختيارية. كلما أضفت معلومات موثقة وذات صلة، استطاع النظام مراجعة جوانب أكثر من الخطة وتقديم تقرير أكثر اكتمالًا ودقة. عدم إضافة هذه المعلومات لا يعني أن الخطة غير متحققة أو فاشلة.";
const OPTIONAL_HINT_AR =
  "يمكنك إضافة تقييم، أولويات الأسرة، تفضيلات المتعلم، الدعم، أو مصادر سابقة عند توفرها.";

const OPTIONAL_TYPES: InputSourceType[] = [
  "assessment",
  "family_priorities",
  "student_preferences",
  "supports",
  "professional_notes",
  "prior_plan",
  "prior_progress",
];

export const Route = createFileRoute("/cases/$caseId/sources")({
  head: () => ({
    meta: [
      { title: "المصادر — HIMAM" },
      { name: "description", content: "إدارة مصادر المراجعة لحالة HIMAM." },
      { property: "og:title", content: "المصادر — HIMAM" },
      { property: "og:description", content: "إدارة مصادر المراجعة لحالة HIMAM." },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { caseId } = Route.useParams();
  const optionalStorageKey = `himam.sources.optionalOpen.${caseId}`;
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addType, setAddType] = useState<InputSourceType>("assessment");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addManualText, setAddManualText] = useState<string>("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [planUsable, setPlanUsable] = useState<boolean>(false);
  // Progressive disclosure state
  const [optionalOpen, setOptionalOpenState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(optionalStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const setOptionalOpen = (next: boolean) => {
    setOptionalOpenState(next);
    try {
      window.sessionStorage.setItem(optionalStorageKey, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const [openSourceType, setOpenSourceType] = useState<InputSourceType | null>(null);
  const [impactDetailsOpen, setImpactDetailsOpen] = useState<boolean>(false);
  const openerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeOpenerRef = useRef<HTMLElement | null>(null);
  const toggleId = "optional-inputs-toggle";
  const panelId = "optional-inputs-panel";
  // Unsaved-changes state for the source management panel.
  const panelDirty = addFile !== null || addManualText.trim().length > 0;
  const closeManagePanel = () => {
    setOpenSourceType(null);
    setAddFile(null);
    setAddManualText("");
    setError(null);
  };

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    setSources(svc.sourcesFor(caseId));
    setPlanUsable(await svc.hasUsablePlanSource(caseId));
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  // Auto-enable the optional-inputs section whenever the case already has
  // any optional source (added in a previous session). Never auto-disable.
  useEffect(() => {
    const hasOptional = sources.some((s) => s.type !== "plan");
    if (hasOptional && !optionalOpen) setOptionalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </AppShell>
    );
  }

  const readOnly = c.status === "closed";
  const isManual = MANUAL_TEXT_SOURCE_TYPES.includes(addType);
  const isSingle = SINGLE_ACTIVE_SOURCE_TYPES.includes(addType);
  const hasActiveOfType = sources.some((s) => s.type === addType);

  const planSources = sources.filter((s) => s.type === "plan");
  const activePlan = planSources.find((s) => s.status === "ready_for_future_ingestion") ?? null;
  const planImpact = INPUT_IMPACTS.plan;
  const formatBytes = (n: number): string => {
    if (n < 1024) return `${n} بايت`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
    return `${(n / (1024 * 1024)).toFixed(2)} ميغابايت`;
  };

  const onUploadPlan = async () => {
    if (readOnly || busy || !planFile) return;
    setPlanError(null);
    setBusy(true);
    try {
      const v = validatePlanFile({
        name: planFile.name,
        size: planFile.size,
        type: planFile.type,
      });
      if (!v.ok) {
        setPlanError(v.reason);
        return;
      }
      const svc = new CaseService();
      const src = svc.registerSource({
        reviewCaseId: caseId,
        type: "plan",
        fileName: planFile.name,
        mimeType: planFile.type || null,
        status: "registered",
      });
      await svc.attachPlanFile(src.id, planFile);
      setPlanFile(null);
      await refresh();
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onReplacePlan = async () => {
    if (readOnly || busy || !replaceFile) return;
    setPlanError(null);
    setBusy(true);
    try {
      await new CaseService().replacePlanFile(caseId, replaceFile);
      setReplaceFile(null);
      await refresh();
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemovePlan = async () => {
    if (readOnly || busy || !activePlan) return;
    setBusy(true);
    try {
      await new CaseService().removeSource(activePlan.id);
      setConfirmRemove(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Provisional scope — derived live from current sources & phase, without persisting anything.
  const activeInputs: ReviewInputType[] = [];
  if (c.ageYears !== null || c.phaseId !== null) activeInputs.push("age_phase");
  const readySourceTypes = new Set(
    sources.filter((s) => s.status === "ready_for_future_ingestion").map((s) => s.type),
  );
  for (const t of readySourceTypes) activeInputs.push(SOURCE_TYPE_TO_REVIEW_INPUT[t]);
  const provisionalScope = computeProvisionalScope(activeInputs, c.phaseId);
  const bucketCounts = countScopeBuckets(provisionalScope);
  const expandable = expandableSources(activeInputs, c.phaseId);

  const onAdd = async (replaceId?: string) => {
    if (addType === "plan") return; // plan is handled by the dedicated card
    if (readOnly || busy) return;
    setError(null);
    setBusy(true);
    try {
      const svc = new CaseService();
      if (isSingle && hasActiveOfType && !replaceId) {
        setError("يوجد مصدر نشط من هذا النوع. استخدم الاستبدال بدلًا من الإضافة.");
        return;
      }
      if (replaceId) {
        await svc.removeSource(replaceId);
      }
      if (isManual) {
        const text = addManualText.trim();
        if (!text) {
          setError("أدخل نصًا يدويًا.");
          return;
        }
        const src = svc.registerSource({
          reviewCaseId: caseId,
          type: addType,
          fileName: "نص يدوي",
          mimeType: null,
        });
        const repo = getDefaultRepository();
        const storage = getDefaultPlanFileStorage();
        const extractor = new DefaultDocumentTextExtractor();
        const ingestion = new IngestionService(repo, storage, extractor);
        await ingestion.ingestManualText(src.id, text);
        setAddManualText("");
      } else {
        if (!addFile) {
          setError("اختر ملفًا PDF أو DOCX أو TXT.");
          return;
        }
        const v = validatePlanFile({
          name: addFile.name,
          size: addFile.size,
          type: addFile.type,
        });
        const src = svc.registerSource({
          reviewCaseId: caseId,
          type: addType,
          fileName: addFile.name,
          mimeType: addFile.type || null,
          status: v.ok ? "registered" : v.status,
        });
        if (v.ok) {
          await svc.attachPlanFile(src.id, addFile);
        } else {
          setError(v.reason);
        }
        setAddFile(null);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (sourceId: string) => {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      await new CaseService().removeSource(sourceId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowShell caseId={caseId} currentStep="sources" width="regular">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="خطة المراجعة"
        stepIndicatorAr="الخطوة 2 من 8"
        descriptionAr="تأكد من حفظ الخطة، ثم انتقل إلى تجهيز الخطة وبدء المراجعة."
        requiredNowAr={
          planUsable
            ? "الخطة محفوظة. الخطوة التالية: تجهيز الخطة وبدء المراجعة."
            : "أرفق ملف الخطة الحالية أولًا."
        }
        trailing={
          <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
            العودة إلى ملخص الحالة
          </Link>
        }
      />

      {c.scopeNeedsReconfirmation && (
        <div
          role="alert"
          data-testid="scope-reconfirmation-alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          تغيّرت المصادر منذ آخر تأكيد للنطاق. يجب إعادة تأكيد نطاق المراجعة قبل إكمال تأكيد
          الاستخراج.
        </div>
      )}

      {/* 1) Plan saved — the very first thing the user sees. */}
      {activePlan && (
        <section
          data-testid="plan-saved-card"
          className="mb-4 rounded-md border-2 border-emerald-300 bg-emerald-50 p-4"
        >
          <h2 className="text-lg font-semibold text-emerald-900">
            {planUsable ? "تم حفظ الخطة بنجاح" : "سجل الخطة موجود — الملف غير قابل للقراءة"}
          </h2>
          <p className="mt-1 text-sm text-emerald-900" data-testid="plan-saved-filename">
            {activePlan.fileName}
          </p>
          <p className="mt-1 text-xs text-emerald-800" data-testid="plan-saved-state">
            {planUsable
              ? "الملف محفوظ داخل متصفحك وجاهز للتجهيز."
              : "أعد رفع الملف من قسم إدارة ملف الخطة بالأسفل."}
          </p>
        </section>
      )}

      {/* 2) One obvious next action. */}
      {planUsable && (
        <section
          data-testid="next-step-card"
          className="mb-6 rounded-md border-2 border-primary/40 bg-primary/5 p-4"
        >
          <h2 className="text-lg font-semibold">ما الخطوة التالية؟</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            سيقرأ النظام محتوى الخطة ويقترح بنودها لتراجعها وتؤكدها بنفسك.
          </p>
          <Link
            to="/cases/$caseId/ingestion"
            params={{ caseId }}
            data-testid="sources-primary-cta"
            className="mt-3 min-h-11 inline-flex items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            تجهيز الخطة وبدء المراجعة
          </Link>
        </section>
      )}

      <section className="space-y-4">
        {!activePlan && (
        <div
          data-testid="plan-card"
          className="rounded-md border-2 border-primary/30 bg-primary/5 p-4"
          data-source-type="plan"
        >
          <div className="mb-2">
            <h2 className="text-lg font-semibold">{planImpact.titleAr}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                {planImpact.requirementLabelAr}
              </span>
              <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
                لا توجد خطة نشطة
              </span>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            الخطة الحالية مدخل إلزامي لبدء المراجعة.
          </p>
          <div data-testid="plan-upload-area" className="rounded-md border border-dashed border-primary/40 bg-background p-4">
            <label className="block text-sm">
              رفع ملف الخطة (PDF / DOCX / TXT)
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                data-testid="plan-upload-input"
                onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
                disabled={readOnly || busy}
                className="mt-1 block w-full text-sm"
              />
            </label>
            {planFile && (
              <div className="mt-2 text-xs text-muted-foreground">
                {planFile.name} · {formatBytes(planFile.size)}
              </div>
            )}
            {planError && <p className="mt-2 text-sm text-destructive">{planError}</p>}
            <button
              type="button"
              data-testid="plan-upload-submit"
              disabled={readOnly || busy || !planFile}
              onClick={() => void onUploadPlan()}
              className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              رفع الخطة الحالية
            </button>
          </div>
        </div>
        )}

        {/* 3) Plan file management — secondary, collapsed. */}
        {activePlan && !readOnly && (
          <CollapsibleSection
            titleAr="إدارة ملف الخطة"
            hintAr="استبدال أو إزالة"
            data-testid="plan-manage-section"
          >
            <div className="rounded-md border border-border p-3">
              <label className="block text-sm">
                استبدال الملف (PDF / DOCX / TXT)
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  data-testid="plan-replace-input"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                  className="mt-1 block w-full text-sm"
                />
              </label>
              {replaceFile && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {replaceFile.name} · {formatBytes(replaceFile.size)}
                </div>
              )}
              {planError && <p className="mt-2 text-sm text-destructive">{planError}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="plan-replace-submit"
                  disabled={busy || !replaceFile}
                  onClick={() => void onReplacePlan()}
                  className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  استبدال الخطة
                </button>
                {!confirmRemove ? (
                  <button
                    type="button"
                    data-testid="plan-remove-request"
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                    className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    إزالة الخطة
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                    <span>ستُلغى نتائج المراجعة والتقرير المرتبطة بهذه الخطة. متابعة؟</span>
                    <button
                      type="button"
                      data-testid="plan-remove-confirm"
                      onClick={() => void onRemovePlan()}
                      className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:opacity-90"
                    >
                      نعم، إزالة
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                      className="rounded-md border border-input px-2 py-1 text-xs"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

      {/* 4) Optional supporting information — closed by default. */}
      <section
        className="rounded-md border border-border bg-background p-4"
        data-testid="optional-inputs-toggle-section"
      >
        <div className="flex items-start gap-3">
          <input
            id={toggleId}
            type="checkbox"
            data-testid="optional-inputs-toggle"
            className="mt-1 h-4 w-4"
            checked={optionalOpen}
            aria-expanded={optionalOpen}
            aria-controls={panelId}
            onChange={(e) => setOptionalOpen(e.target.checked)}
            disabled={readOnly}
          />
          <div className="min-w-0 flex-1">
            <label htmlFor={toggleId} className="block cursor-pointer text-sm font-medium">
              إضافة معلومات داعمة (اختياري)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              كل معلومة موثقة تضيفها تتيح للنظام مراجعة جوانب أكثر من الخطة. عدم إضافتها لا يعني
              أن الخطة غير سليمة.
            </p>
            {optionalOpen && (
              <p className="mt-1 text-xs text-muted-foreground">
                {sources.filter((s) => s.type !== "plan").length > 0
                  ? `عدد المعلومات الداعمة المضافة: ${sources.filter((s) => s.type !== "plan").length}`
                  : "لم تُضف أي معلومة داعمة بعد."}
              </p>
            )}
          </div>
        </div>
      </section>

      {optionalOpen && (
        <div id={panelId} className="space-y-6" data-testid="optional-inputs-panel">
          {sources.some((s) => s.type !== "plan") && (
            <section data-testid="added-optional-section">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                المعلومات المضافة
              </h3>
              <ul className="space-y-2">
                {sources
                  .filter((s) => s.type !== "plan")
                  .map((s) => (
                    <li
                      key={s.id}
                      className="rounded-md border border-border bg-background p-3 text-sm"
                      data-testid={`added-source-${s.type}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 truncate font-medium">
                          {SOURCE_TYPE_LABELS_AR[s.type]} —{" "}
                          {s.manualTextArtifactId ? "نص مُدخَل يدويًا" : s.fileName}
                        </div>
                        <button
                          type="button"
                          disabled={readOnly || busy}
                          onClick={() => void onRemove(s.id)}
                          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          إزالة
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section data-testid="optional-source-cards">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              معلومات يمكن إضافتها
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">{GOVERNANCE_NOTE_AR}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {OPTIONAL_TYPES.map((t) => {
                const items = sources.filter((s) => s.type === t);
                const added = items.length > 0;
                const impact = INPUT_IMPACTS[SOURCE_TYPE_TO_IMPACT_KEY[t]];
                const isOpen = openSourceType === t;
                return (
                  <div
                    key={t}
                    className="rounded-md border border-border bg-background p-3"
                    data-source-type={t}
                    data-testid={`compact-card-${t}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{impact.titleAr}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                            اختياري
                          </span>
                          {added && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900">
                              {items.length === 1 ? "مصدر واحد" : `${items.length} مصادر`}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{OPTIONAL_SHORT_AR[t]}</p>
                      </div>
                      <button
                        type="button"
                        ref={(el) => {
                          openerRefs.current[t] = el;
                        }}
                        data-testid={`open-manage-${t}`}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? "source-manage-panel" : undefined}
                        onClick={() => {
                          activeOpenerRef.current = openerRefs.current[t] ?? null;
                          setOpenSourceType(t);
                          setAddType(t);
                          setError(null);
                          setAddFile(null);
                          setAddManualText("");
                        }}
                        disabled={readOnly}
                        className="shrink-0 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {added ? "عرض وإدارة" : "إضافة"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      </section>

      {/* 5) Impact counters — secondary detail, collapsed, at the bottom. */}
      <CollapsibleSection
        className="mt-6"
        titleAr="أثر المعلومات على نطاق المراجعة"
        hintAr="تفاصيل اختيارية"
        data-testid="scope-impact-summary"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          هذه مؤشرات لنطاق المراجعة الممكن، وليست درجة لجودة الخطة.
        </p>
        <div
          className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"
          data-testid="scope-counters-grid"
        >
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold" data-testid="count-available">
              {bucketCounts.available}
            </div>
            <div className="text-xs text-muted-foreground">معايير قابلة للمراجعة</div>
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold" data-testid="count-not-reviewable">
              {bucketCounts.notReviewable}
            </div>
            <div className="text-xs text-muted-foreground">معايير غير قابلة للمراجعة</div>
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-center">
            <div className="text-2xl font-bold" data-testid="count-not-applicable">
              {bucketCounts.notApplicable}
            </div>
            <div className="text-xs text-muted-foreground">معايير غير منطبقة</div>
          </div>
        </div>
        {expandable.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            يمكن توسيع نطاق المراجعة بإضافة معلومات موثقة إضافية.
          </p>
        )}
        <details
          className="mt-3"
          data-testid="impact-details"
          open={impactDetailsOpen}
          onToggle={(e) => setImpactDetailsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm font-medium text-primary">
            عرض تفاصيل الأثر
          </summary>
          <div className="mt-3 space-y-2 text-xs">
            {expandable.length > 0 && (
              <div className="text-muted-foreground" data-testid="expandable-sources">
                <span className="font-medium">مصادر يمكن أن توسع النطاق عند إضافتها: </span>
                {expandable.map((s) => SOURCE_TYPE_LABELS_AR[s]).join("، ")}
              </div>
            )}
            <ul className="space-y-2">
              {OPTIONAL_TYPES.map((t) => {
                const key = SOURCE_TYPE_TO_IMPACT_KEY[t];
                const impact = INPUT_IMPACTS[key];
                const has = sources.some((s) => s.type === t);
                return (
                  <li key={t} className="rounded-md border border-border bg-background p-2">
                    <div className="font-medium">
                      {impact.titleAr}{" "}
                      <span className="text-muted-foreground">
                        — {has ? "متاح" : "غير متاح"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">عند الإضافة: {impact.whenPresentAr}</div>
                    <div className="text-muted-foreground">عند الغياب: {impact.whenAbsentAr}</div>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground">{PROVISIONAL_SCOPE_DISCLAIMER_AR}</p>
          </div>
        </details>
      </CollapsibleSection>

      {/* Single source-management panel: drawer on desktop, bottom sheet on mobile. */}
      {openSourceType && (
        <ResponsivePanel
          open
          data-testid={`manage-drawer-${openSourceType}`}
          titleAr={`إدارة: ${INPUT_IMPACTS[SOURCE_TYPE_TO_IMPACT_KEY[openSourceType]].titleAr}`}
          descriptionAr="أضف مصدرًا واحدًا في كل مرة. البيانات تُحفظ محليًا داخل المتصفح."
          dirty={panelDirty}
          onClose={closeManagePanel}
          returnFocusTo={activeOpenerRef}
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="panel-save-source"
                disabled={readOnly || busy}
                onClick={async () => {
                  await onAdd();
                  setAddFile(null);
                  setAddManualText("");
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={closeManagePanel}
                className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          }
        >
          <div id="source-manage-panel" className="space-y-3 text-xs">
            <div className="space-y-1 text-muted-foreground">
              <div>
                <span className="font-medium">عند الإضافة: </span>
                {INPUT_IMPACTS[SOURCE_TYPE_TO_IMPACT_KEY[openSourceType]].whenPresentAr}
              </div>
              <div>
                <span className="font-medium">عند الغياب: </span>
                {INPUT_IMPACTS[SOURCE_TYPE_TO_IMPACT_KEY[openSourceType]].whenAbsentAr}
              </div>
            </div>

            {sources.filter((s) => s.type === openSourceType).length > 0 && (
              <ul className="space-y-1" data-testid="panel-existing-sources">
                {sources
                  .filter((s) => s.type === openSourceType)
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1"
                    >
                      <span className="truncate">
                        {s.manualTextArtifactId ? "نص يدوي" : s.fileName} · تجهيز:{" "}
                        {EXTRACTION_STAGE_LABELS_AR[s.extractionStage]}
                      </span>
                      <button
                        type="button"
                        disabled={readOnly || busy}
                        onClick={() => void onRemove(s.id)}
                        className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        إزالة
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {MANUAL_TEXT_SOURCE_TYPES.includes(openSourceType) ? (
              <label className="block">
                نص يدوي
                <textarea
                  data-autofocus
                  data-testid="panel-manual-text"
                  value={addManualText}
                  onChange={(e) => setAddManualText(e.target.value)}
                  disabled={readOnly || busy}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
              </label>
            ) : (
              <label className="block">
                ملف (PDF / DOCX / TXT)
                <input
                  type="file"
                  data-autofocus
                  data-testid="panel-file-input"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
                  disabled={readOnly || busy}
                  className="mt-1 block w-full text-xs"
                />
              </label>
            )}
            {error && (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              يُحفظ الملف/النص محليًا داخل المتصفح ولا يُرفع لأي خدمة خارجية.
            </p>
          </div>
        </ResponsivePanel>
      )}

      <StageFooter
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="تجهيز الخطة وبدء المراجعة"
        continueHref={planUsable ? `/cases/${caseId}/ingestion` : undefined}
        continueDisabled={!planUsable}
        continueDisabledReasonAr={
          !planUsable ? "أرفق الخطة الحالية واحفظها أولًا." : undefined
        }
      />
      {planUsable && (
        <Link
          to="/cases/$caseId/ingestion"
          params={{ caseId }}
          data-testid="ingestion-link"
          className="sr-only"
        >
          الانتقال إلى تجهيز النصوص
        </Link>
      )}
      {!planUsable && (
        <span data-testid="ingestion-link-disabled" className="sr-only">
          أرفق الخطة الحالية أولًا.
        </span>
      )}
    </WorkflowShell>
  );
}
