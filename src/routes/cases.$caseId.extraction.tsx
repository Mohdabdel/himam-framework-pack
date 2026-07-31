import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  WorkflowShell,
  CaseExtractionService,
  CollapsibleSection,
  ResponsivePanel,
  EVIDENCE_STATUS_LABELS_AR,
  EVIDENCE_TYPE_LABELS_AR,
  EvidenceService,
  IdentityIntegrityService,
  ExtractionRunService,
  LocalFallbackExtractionProvider,
  LOCAL_FALLBACK_LABEL_AR,
  ServerEvidenceExtractionProvider,
  StageFooter,
  StageHeader,
  SOURCE_TYPE_LABELS_AR,
  ALLOWED_EVIDENCE_TYPES,
  getDefaultRepository,
} from "@/features/himam";
import type {
  CanCompleteReason,
  EvidenceType,
  ExtractedEvidence,
  ExtractionProviderAvailability,
  IdentityIntegrityCheck,
  InputSource,
  ReviewCase,
  TextChunk,
} from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId/extraction")({
  head: () => ({
    meta: [
      { title: "استخراج الأدلة — HIMAM" },
      { name: "description", content: "مراجعة وتأكيد الأدلة المستخرجة من مصادر المراجعة." },
      { property: "og:title", content: "استخراج الأدلة — HIMAM" },
      {
        property: "og:description",
        content: "مراجعة وتأكيد الأدلة المستخرجة من مصادر المراجعة.",
      },
    ],
  }),
  component: ExtractionPage,
});

const REASON_LABELS_AR: Record<CanCompleteReason, string> = {
  extraction_in_progress: "توجد عملية استخراج جارية.",
  pending_evidence: "توجد أدلة معلقة تحتاج مراجعة.",
  identity_conflict: "يوجد تعارض في علامات الهوية.",
  plan_missing: "لا توجد خطة حالية مسجلة.",
  plan_text_and_evidence_missing: "الخطة بلا نص جاهز ولا دليل يدوي مؤكد.",
  unresolved_text_unavailable_source: "يوجد مصدر بلا نص بحاجة لقرار.",
  scope_needs_reconfirmation: "يجب إعادة تأكيد نطاق المراجعة.",
  case_closed: "الحالة مغلقة.",
  case_not_found: "الحالة غير موجودة.",
};

function ExtractionPage() {
  const { caseId } = Route.useParams();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [evidence, setEvidence] = useState<ExtractedEvidence[]>([]);
  const [identity, setIdentity] = useState<IdentityIntegrityCheck | null>(null);
  const [aiAvailability, setAiAvailability] =
    useState<ExtractionProviderAvailability>("not_configured");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Manual add form
  const [addSourceId, setAddSourceId] = useState<string>("");
  const [addChunkId, setAddChunkId] = useState<string>("");
  const [addType, setAddType] = useState<EvidenceType>("other");
  const [addQuote, setAddQuote] = useState<string>("");
  const [addNormalized, setAddNormalized] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [suggestBusy, setSuggestBusy] = useState<boolean>(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  // Evidence action panel replaces the old native browser dialogs.
  const [panel, setPanel] = useState<
    { evidenceId: string; mode: "edit" | "reject" } | null
  >(null);
  const [panelText, setPanelText] = useState<string>("");
  const evidenceOpenerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeOpenerRef = useRef<HTMLElement | null>(null);

  const refresh = () => {
    const repo = getDefaultRepository();
    const store = repo.load();
    const cc = store.cases.find((x) => x.id === caseId) ?? null;
    setC(cc);
    setSources(store.sources.filter((s) => s.reviewCaseId === caseId));
    setChunks(
      store.textChunks
        .filter((ch) =>
          store.sources.some((s) => s.id === ch.sourceId && s.reviewCaseId === caseId),
        )
        .sort((a, b) => a.order - b.order),
    );
    setEvidence(
      store.extractedEvidence
        .filter((e) => e.reviewCaseId === caseId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
    try {
      const idSvc = new IdentityIntegrityService(repo);
      setIdentity(idSvc.recompute(caseId));
    } catch {
      setIdentity(null);
    }
  };

  useEffect(() => {
    refresh();
    const provider = new ServerEvidenceExtractionProvider();
    void provider
      .availability()
      .then(setAiAvailability)
      .catch(() => setAiAvailability("not_configured"));
  }, [caseId]);

  const chunksForSource = useMemo(
    () => chunks.filter((ch) => ch.sourceId === addSourceId),
    [chunks, addSourceId],
  );

  const allowedTypesForSource = useMemo(() => {
    const s = sources.find((x) => x.id === addSourceId);
    return s ? ALLOWED_EVIDENCE_TYPES[s.type] : [];
  }, [sources, addSourceId]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </AppShell>
    );
  }

  const readOnly = c.status === "closed";

  const doCreateManual = () => {
    setAddError(null);
    try {
      const repo = getDefaultRepository();
      const svc = new EvidenceService(repo);
      svc.createManualEvidence({
        sourceId: addSourceId,
        chunkId: addChunkId,
        exactQuote: addQuote,
        evidenceType: addType,
        normalizedText: addNormalized || undefined,
      });
      setAddQuote("");
      setAddNormalized("");
      refresh();
    } catch (e) {
      setAddError((e as Error).message);
    }
  };

  const withSvc = (fn: (svc: EvidenceService) => void) => {
    if (readOnly) return;
    setError(null);
    try {
      fn(new EvidenceService(getDefaultRepository()));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const acknowledgeConflict = () => {
    if (readOnly) return;
    try {
      new IdentityIntegrityService(getDefaultRepository()).acknowledgeIdentityConflict(caseId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const completeExtraction = () => {
    if (readOnly || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      new CaseExtractionService(getDefaultRepository()).completeExtractionConfirmation(caseId);
      setSuccess("تم إكمال تأكيد الاستخراج. يمكنك الآن الانتقال إلى المراجعة المهنية.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Deterministic offline suggestion pass. It never judges and never invents
  // text; it only lifts literal lines out of the already-stored chunks so the
  // reviewer has something concrete to confirm, edit, or reject.
  const runLocalSuggestions = async () => {
    if (readOnly || suggestBusy) return;
    setSuggestBusy(true);
    setError(null);
    setSuggestNote(null);
    try {
      const repo = getDefaultRepository();
      const svc = new ExtractionRunService(repo, new LocalFallbackExtractionProvider());
      const withText = sources.filter((s) =>
        chunks.some((ch) => ch.sourceId === s.id),
      );
      let created = 0;
      for (const s of withText) {
        const res = await svc.start({ reviewCaseId: caseId, sourceId: s.id });
        created += res.createdEvidence.length;
      }
      setSuggestNote(
        created > 0
          ? `تم اقتراح ${created} بندًا من نص المصادر. راجع كل بند وأكِّده أو عدّله أو ارفضه.`
          : "لم يُعثر على بنود جديدة قابلة للاقتراح. يمكنك إضافة الأدلة يدويًا.",
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggestBusy(false);
    }
  };

  const extractionConfirmed = c.extractionStage === "extraction_confirmed";
  const canComplete = new CaseExtractionService(
    getDefaultRepository(),
  ).canCompleteExtractionConfirmation(caseId);

  // Group filters
  const filtered = evidence.filter((e) => {
    if (filterSource !== "all" && e.sourceId !== filterSource) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const counts = {
    pending: evidence.filter((e) => e.status === "pending").length,
    confirmed: evidence.filter((e) => e.status === "confirmed").length,
    edited: evidence.filter((e) => e.status === "edited").length,
    rejected: evidence.filter((e) => e.status === "rejected").length,
    invalidated: evidence.filter((e) => e.status === "invalidated").length,
  };

  return (
    <WorkflowShell caseId={caseId} currentStep="evidence" width="wide">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="استخراج الأدلة وتأكيدها"
        stepIndicatorAr="الخطوة 4 من 8"
        descriptionAr="مراجعة الأدلة المستخرجة أو المضافة يدويًا، وتأكيدها قبل إغلاق الاستخراج."
        requiredNowAr="راجع كل دليل معلق، ثم أكمل تأكيد الاستخراج."
        trailing={
          <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
            العودة إلى ملخص الحالة
          </Link>
        }
      />

      <div
        role="note"
        className="mb-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm"
        data-testid="evidence-disclaimer"
      >
        هذه أدلة مستخرجة فقط، وليست نتائج مراجعة جودة للخطة.
      </div>

      <section className="mb-6 rounded-md border border-border p-4" data-testid="ai-status">
        <h2 className="mb-2 text-lg font-semibold">اقتراح بنود الخطة تلقائيًا</h2>
        <p className="text-sm text-muted-foreground">
          {LOCAL_FALLBACK_LABEL_AR} — يقرأ النظام نص المصادر ويعرض عليك الأسطر الموجودة فعلًا داخل
          الملف. لا يصدر أي حكم، ولا يُحتسب أي بند قبل تأكيدك له.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="run-local-extraction"
            disabled={readOnly || suggestBusy || chunks.length === 0}
            onClick={() => void runLocalSuggestions()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {suggestBusy ? "جارٍ الاقتراح…" : "اقتراح البنود من نص الخطة"}
          </button>
          {chunks.length === 0 && (
            <span className="text-xs text-muted-foreground">
              لا يوجد نص مقروء بعد — عد إلى خطوة قراءة المحتوى.
            </span>
          )}
          {aiAvailability === "configured" && (
            <span className="text-xs text-muted-foreground">
              مزود الاستخراج المتقدم مهيأ على الخادم.
            </span>
          )}
        </div>
        {suggestNote && (
          <p className="mt-2 text-sm text-emerald-800" data-testid="local-extraction-note">
            {suggestNote}
          </p>
        )}
      </section>

      <CollapsibleSection
        className="mb-6"
        titleAr="إضافة دليل يدوي"
        hintAr="اختياري"
        data-testid="manual-add-section"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            المصدر
            <select
              value={addSourceId}
              onChange={(e) => {
                setAddSourceId(e.target.value);
                setAddChunkId("");
              }}
              disabled={readOnly}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">اختر مصدرًا</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {SOURCE_TYPE_LABELS_AR[s.type]} — {s.fileName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            المقطع (Chunk)
            <select
              value={addChunkId}
              onChange={(e) => setAddChunkId(e.target.value)}
              disabled={readOnly || !addSourceId}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">اختر مقطعًا</option>
              {chunksForSource.map((ch) => (
                <option key={ch.chunkId} value={ch.chunkId}>
                  {ch.locator.kind === "pdf_page"
                    ? `صفحة ${ch.locator.pageNumber}`
                    : ch.locator.kind === "docx_paragraph"
                      ? `فقرة ${ch.locator.paragraphIndex + 1}`
                      : ch.locator.kind === "text_lines"
                        ? `أسطر ${ch.locator.lineStart + 1}–${ch.locator.lineEnd + 1}`
                        : "نص يدوي"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            نوع الدليل
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as EvidenceType)}
              disabled={readOnly || !addSourceId}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {allowedTypesForSource.map((t) => (
                <option key={t} value={t}>
                  {EVIDENCE_TYPE_LABELS_AR[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            اقتباس حرفي من المقطع
            <textarea
              value={addQuote}
              onChange={(e) => setAddQuote(e.target.value)}
              rows={2}
              disabled={readOnly}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            نص مُطبَّع (اختياري)
            <input
              value={addNormalized}
              onChange={(e) => setAddNormalized(e.target.value)}
              disabled={readOnly}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        {addError && (
          <p className="mt-2 text-sm text-destructive" data-testid="manual-add-error">
            {addError}
          </p>
        )}
        <button
          type="button"
          onClick={doCreateManual}
          disabled={readOnly || !addSourceId || !addChunkId || !addQuote.trim()}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          حفظ الدليل (معلق)
        </button>
      </CollapsibleSection>

      <section className="mb-6 rounded-md border border-border p-4" data-testid="identity-section">
        <h2 className="mb-2 text-lg font-semibold">فحص الهوية</h2>
        {!identity || identity.status === "not_checked" ? (
          <p className="text-sm text-muted-foreground">لم يُجرَ فحص الهوية بعد.</p>
        ) : identity.status === "consistent" ? (
          <p className="text-sm text-green-700">علامات الهوية متسقة.</p>
        ) : identity.status === "acknowledged" ? (
          <p className="text-sm text-muted-foreground">تم الإقرار بتعارض علامات الهوية سابقًا.</p>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="mb-2 text-destructive">
              علامات الهوية غير متطابقة بين المصادر. لا يُحدَّد أي مستند خاطئ. راجِع المصادر أو أعد
              الإقرار بالتعارض للمتابعة.
            </p>
            <button
              type="button"
              onClick={acknowledgeConflict}
              disabled={readOnly}
              className="rounded-md border border-input bg-background px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              الإقرار بالتعارض والمتابعة
            </button>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">قائمة الأدلة</h2>
          <div className="text-xs text-muted-foreground">
            معلق: {counts.pending} · مؤكد: {counts.confirmed} · معدل: {counts.edited} · مرفوض:{" "}
            {counts.rejected} · ملغى: {counts.invalidated}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="all">كل المصادر</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {SOURCE_TYPE_LABELS_AR[s.type]} — {s.fileName}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="all">كل الحالات</option>
            <option value="pending">معلق</option>
            <option value="confirmed">مؤكد</option>
            <option value="edited">معدل</option>
            <option value="rejected">مرفوض</option>
            <option value="invalidated">ملغى</option>
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أدلة مطابقة.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((ev) => {
              const src = sources.find((s) => s.id === ev.sourceId);
              return (
                <li
                  key={ev.id}
                  className="rounded-md border border-border/60 p-3 text-sm"
                  data-evidence-id={ev.id}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {EVIDENCE_TYPE_LABELS_AR[ev.evidenceType]} ·{" "}
                      {src ? SOURCE_TYPE_LABELS_AR[src.type] : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {EVIDENCE_STATUS_LABELS_AR[ev.status]} · طريقة:{" "}
                      {ev.extractionMethod === "manual" ? "يدوي" : "آلي"} · ثقة: {ev.confidence}
                    </span>
                  </div>
                  <blockquote className="mb-2 rounded bg-muted/40 p-2 text-sm">
                    «{ev.exactQuote}»
                  </blockquote>
                  <div className="mb-2 text-xs text-muted-foreground">
                    نص مُطبَّع: {ev.normalizedText}
                  </div>
                  {ev.confidence === "low" && (
                    <p className="mb-2 text-xs text-amber-700">تحذير: مستوى الثقة منخفض.</p>
                  )}
                  {(ev.status === "pending" || ev.status === "edited") && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => withSvc((s) => void s.confirmEvidence(ev.id))}
                        className="rounded-md border border-input px-2 py-1 hover:bg-accent"
                      >
                        تأكيد
                      </button>
                      <button
                        type="button"
                        ref={(el) => {
                          evidenceOpenerRefs.current[`edit-${ev.id}`] = el;
                        }}
                        data-testid={`open-edit-${ev.id}`}
                        disabled={readOnly}
                        onClick={() => {
                          activeOpenerRef.current =
                            evidenceOpenerRefs.current[`edit-${ev.id}`] ?? null;
                          setPanelText(ev.normalizedText);
                          setPanel({ evidenceId: ev.id, mode: "edit" });
                        }}
                        className="rounded-md border border-input px-2 py-1 hover:bg-accent"
                      >
                        تعديل النص المُطبَّع
                      </button>
                      <button
                        type="button"
                        ref={(el) => {
                          evidenceOpenerRefs.current[`reject-${ev.id}`] = el;
                        }}
                        data-testid={`open-reject-${ev.id}`}
                        disabled={readOnly}
                        onClick={() => {
                          activeOpenerRef.current =
                            evidenceOpenerRefs.current[`reject-${ev.id}`] ?? null;
                          setPanelText("");
                          setPanel({ evidenceId: ev.id, mode: "reject" });
                        }}
                        className="rounded-md border border-input px-2 py-1 hover:bg-accent"
                      >
                        رفض
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">إكمال تأكيد الاستخراج</h2>
        {canComplete.ok ? (
          <p className="text-sm text-green-700">جميع الشروط مستوفاة.</p>
        ) : (
          <p className="text-sm text-amber-700" data-testid="complete-blocked-reason">
            متعذر الإكمال: {REASON_LABELS_AR[canComplete.reason]}
          </p>
        )}
        <button
          type="button"
          onClick={completeExtraction}
          disabled={readOnly || !canComplete.ok || busy}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          إكمال تأكيد الاستخراج
        </button>
        {success && <p className="mt-2 text-sm text-green-700">{success}</p>}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>

      {panel && (
        <ResponsivePanel
          open
          data-testid={`evidence-panel-${panel.mode}`}
          titleAr={panel.mode === "edit" ? "تعديل النص المُطبَّع" : "رفض الدليل"}
          descriptionAr={
            panel.mode === "edit"
              ? "لا يمكن تعديل الاقتباس الحرفي؛ التعديل يقتصر على النص المُطبَّع."
              : "يمكنك إضافة سبب مختصر للرفض (اختياري)."
          }
          dirty={panelText.trim().length > 0}
          onClose={() => setPanel(null)}
          returnFocusTo={activeOpenerRef}
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="evidence-panel-save"
                disabled={readOnly || (panel.mode === "edit" && !panelText.trim())}
                onClick={() => {
                  const id = panel.evidenceId;
                  const text = panelText.trim();
                  if (panel.mode === "edit") {
                    withSvc((s) => void s.editNormalizedText(id, text));
                  } else {
                    withSvc((s) => void s.rejectEvidence(id, text || undefined));
                  }
                  setPanel(null);
                  setPanelText("");
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {panel.mode === "edit" ? "حفظ التعديل" : "تأكيد الرفض"}
              </button>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          }
        >
          <label className="block text-xs">
            {panel.mode === "edit" ? "النص المُطبَّع" : "سبب الرفض (اختياري)"}
            <textarea
              data-autofocus
              data-testid="evidence-panel-text"
              value={panelText}
              onChange={(e) => setPanelText(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
          </label>
        </ResponsivePanel>
      )}

      <StageFooter
        backHref={`/cases/${caseId}/ingestion`}
        backLabelAr="السابق: قراءة المحتوى"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="المتابعة إلى تأكيد نطاق المراجعة"
        continueHref={extractionConfirmed ? `/cases/${caseId}/scope` : undefined}
        continueDisabled={!extractionConfirmed}
        continueDisabledReasonAr={
          extractionConfirmed
            ? undefined
            : canComplete.ok
              ? "أكمِل تأكيد الاستخراج أولًا."
              : REASON_LABELS_AR[canComplete.reason]
        }
      />
    </WorkflowShell>
  );
}
