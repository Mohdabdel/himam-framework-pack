import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseService,
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
  SINGLE_ACTIVE_SOURCE_TYPES,
  SOURCE_TYPE_LABELS_AR,
  SOURCE_TYPES_ORDER,
  EXTRACTION_STAGE_LABELS_AR,
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
  const navigate = useNavigate();
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

  if (!c) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </div>
    );
  }

  const readOnly = c.status === "closed";
  const NON_PLAN_TYPES = SOURCE_TYPES_ORDER.filter((t) => t !== "plan");
  if (!NON_PLAN_TYPES.includes(addType)) {
    // Guard: addType was reset in state; keep default consistent.
  }
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
    <div dir="rtl" className="mx-auto max-w-4xl px-6 py-10 font-sans">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مصادر المراجعة وأثرها</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            المرحلة 2 من رحلة الحالة — أضف المصادر الاختيارية لتوسيع نطاق المراجعة الممكن.
          </p>
        </div>
        <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
          العودة إلى ملخص الحالة
        </Link>
      </header>

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

      <section
        className="mb-6 rounded-md border border-border bg-muted/30 p-4"
        data-testid="scope-impact-summary"
      >
        <h2 className="mb-2 text-lg font-semibold">أثر المدخلات على نطاق المراجعة</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
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
          <div className="mt-3 text-xs text-muted-foreground" data-testid="expandable-sources">
            <span className="font-medium">مصادر يمكن أن توسع النطاق عند إضافتها: </span>
            {expandable.map((s) => SOURCE_TYPE_LABELS_AR[s]).join("، ")}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{PROVISIONAL_SCOPE_DISCLAIMER_AR}</p>
      </section>

      <section className="space-y-4">
        <div
          data-testid="plan-card"
          className="rounded-md border-2 border-primary/30 bg-primary/5 p-4"
          data-source-type="plan"
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{planImpact.titleAr}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                  {planImpact.requirementLabelAr}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    planUsable
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {planUsable ? "خطة نشطة محفوظة" : "لا توجد خطة نشطة"}
                </span>
              </div>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            الخطة الحالية مدخل إلزامي لاستكمال تجهيز النصوص والمراجعة.
          </p>

          {!activePlan ? (
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
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-background p-3 text-sm">
                <div className="font-medium">{activePlan.fileName}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  حالة التخزين:{" "}
                  {activePlan.status === "ready_for_future_ingestion"
                    ? planUsable
                      ? "محفوظ محليًا"
                      : "ملف الخطة مفقود — أعد رفعه."
                    : activePlan.status === "file_missing"
                      ? "ملف الخطة مفقود — أعد رفعه."
                      : activePlan.status}{" "}
                  · تجهيز النص: {EXTRACTION_STAGE_LABELS_AR[activePlan.extractionStage]}
                </div>
              </div>
              {!readOnly && (
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
                        <span>سيتم إبطال الأدلة والنطاق والمراجعة والتقرير المتأثر. متابعة؟</span>
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
              )}
            </div>
          )}
        </div>

        {SOURCE_TYPES_ORDER.filter((t) => t !== "plan").map((t) => {
          const items = sources.filter((s) => s.type === t);
          const impact = INPUT_IMPACTS[SOURCE_TYPE_TO_IMPACT_KEY[t]];
          const added = items.length > 0;
          return (
            <div key={t} className="rounded-md border border-border p-4" data-source-type={t}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{impact.titleAr}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        impact.requirement === "required"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {impact.requirementLabelAr}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        added
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {added ? "تمت الإضافة" : "لم تُضف بعد"}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {SINGLE_ACTIVE_SOURCE_TYPES.includes(t) ? "مصدر نشط واحد" : "مصدر أو أكثر"}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-2 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>
                  <div className="mb-0.5 font-medium">عند الإضافة:</div>
                  <div className="text-muted-foreground">{impact.whenPresentAr}</div>
                </div>
                <div>
                  <div className="mb-0.5 font-medium">عند عدم الإضافة:</div>
                  <div className="text-muted-foreground">{impact.whenAbsentAr}</div>
                </div>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد مصدر مسجل.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.fileName}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          حالة التخزين:{" "}
                          {s.manualTextArtifactId
                            ? "نص يدوي محفوظ محليًا"
                            : s.status === "ready_for_future_ingestion"
                              ? "محفوظ محليًا"
                              : s.status === "file_missing"
                                ? "الملف مفقود"
                                : s.status === "unreadable"
                                  ? "غير قابل للقراءة"
                                  : "مسجّل"}{" "}
                          · تجهيز النص: {EXTRACTION_STAGE_LABELS_AR[s.extractionStage]}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={readOnly || busy}
                          onClick={() => void onRemove(s.id)}
                          className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          إزالة
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-md border border-border p-4">
        <h2 className="mb-3 text-lg font-semibold">إضافة مصدر</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            النوع
            <select
              data-testid="generic-add-type"
              value={addType}
              onChange={(e) => setAddType(e.target.value as InputSourceType)}
              disabled={readOnly || busy}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SOURCE_TYPES_ORDER.filter((t) => t !== "plan").map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_LABELS_AR[t]}
                </option>
              ))}
            </select>
          </label>
          {isManual ? (
            <label className="block text-sm sm:col-span-2">
              نص يدوي
              <textarea
                value={addManualText}
                onChange={(e) => setAddManualText(e.target.value)}
                disabled={readOnly || busy}
                rows={4}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <label className="block text-sm">
              ملف (PDF / DOCX / TXT)
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
                disabled={readOnly || busy}
                className="mt-1 block w-full text-sm"
              />
            </label>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          يُحفظ الملف/النص محليًا داخل المتصفح ولا يُرفع لأي خدمة خارجية ولا يتاح كرابط عام.
        </p>
        <button
          type="button"
          disabled={readOnly || busy}
          onClick={() => void onAdd()}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          إضافة المصدر
        </button>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {planUsable ? (
          <Link
            to="/cases/$caseId/ingestion"
            params={{ caseId }}
            data-testid="ingestion-link"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            الانتقال إلى تجهيز النصوص
          </Link>
        ) : (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled
              data-testid="ingestion-link-disabled"
              className="cursor-not-allowed rounded-md border border-input px-3 py-1.5 text-sm opacity-50"
            >
              الانتقال إلى تجهيز النصوص
            </button>
            <span className="text-xs text-destructive">أرفق الخطة الحالية واحفظها أولًا.</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void navigate({ to: "/cases/$caseId", params: { caseId } })}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
        >
          العودة
        </button>
      </div>
    </div>
  );
}
