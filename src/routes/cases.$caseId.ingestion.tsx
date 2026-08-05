import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AppShell,
  WorkflowShell,
  CaseService,
  DefaultDocumentTextExtractor,
  EXTRACTION_STAGE_LABELS_AR,
  IngestionService,
  StageFooter,
  StageHeader,
  ResponsivePanel,
  SOURCE_TYPE_LABELS_AR,
  getDefaultPlanFileStorage,
  getDefaultRepository,
} from "@/features/himam";
import type { InputSource, ReviewCase, TextChunk, TextLocator } from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId/ingestion")({
  head: () => ({
    meta: [
      { title: "تجهيز النصوص — HIMAM" },
      { name: "description", content: "تحويل ملفات المصادر إلى نص قابل للاستخدام." },
      { property: "og:title", content: "تجهيز النصوص — HIMAM" },
      {
        property: "og:description",
        content: "تحويل ملفات المصادر إلى نص قابل للاستخدام.",
      },
    ],
  }),
  component: IngestionPage,
});

function locatorLabel(l: TextLocator): string {
  switch (l.kind) {
    case "pdf_page":
      return `صفحة ${l.pageNumber}`;
    case "docx_paragraph":
      return `فقرة ${l.paragraphIndex + 1}`;
    case "text_lines":
      return `الأسطر ${l.lineStart + 1}–${l.lineEnd + 1}`;
    case "manual_text":
      return "نص يدوي";
  }
}

function IngestionPage() {
  const { caseId } = Route.useParams();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [chunksBySource, setChunksBySource] = useState<Record<string, TextChunk[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<string | null>(null);
  const [planBlobMissing, setPlanBlobMissing] = useState<boolean>(false);
  const previewOpenerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeOpenerRef = useRef<HTMLElement | null>(null);
  const autoRanRef = useRef(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    const list = svc.sourcesFor(caseId);
    setSources(list);
    const repo = getDefaultRepository();
    const store = repo.load();
    const map: Record<string, TextChunk[]> = {};
    for (const s of list) {
      map[s.id] = store.textChunks
        .filter((c) => c.sourceId === s.id)
        .sort((a, b) => a.order - b.order);
    }
    setChunksBySource(map);
    // Explicit Blob probe: read (not just has) so the diagnostic reflects
    // reality even if metadata says ready.
    const storage = getDefaultPlanFileStorage();
    const plans = list.filter((s) => s.type === "plan");
    let missing = false;
    for (const p of plans) {
      if (!p.storagePath) continue;
      try {
        const blob = await storage.get(p.id);
        if (!blob || blob.size === 0) {
          missing = true;
          break;
        }
      } catch {
        missing = true;
        break;
      }
    }
    setPlanBlobMissing(plans.length > 0 && missing);
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  // The user should not have to know what "تجهيز النص" means: as soon as the
  // screen opens we read every pending source automatically. Manual buttons
  // stay available for retries and re-reads.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!c || c.status === "closed") return;
    const pending = sources.filter(
      (s) => s.extractionStage === "not_started" && !!s.storagePath && !s.manualTextArtifactId,
    );
    if (pending.length === 0) return;
    autoRanRef.current = true;
    void (async () => {
      setAutoRunning(true);
      const repo = getDefaultRepository();
      const storage = getDefaultPlanFileStorage();
      const ingestion = new IngestionService(repo, storage, new DefaultDocumentTextExtractor());
      for (const s of pending) {
        try {
          await ingestion.ingestSource(s.id);
        } catch {
          // Per-source failure is surfaced by that source's own stage badge.
        }
      }
      await refresh();
      setAutoRunning(false);
    })();
  }, [c, sources]);

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </AppShell>
    );
  }

  const readOnly = c.status === "closed";

  const doIngest = async (s: InputSource) => {
    if (readOnly || busy) return;
    setBusy(s.id);
    setError(null);
    try {
      const repo = getDefaultRepository();
      const storage = getDefaultPlanFileStorage();
      const extractor = new DefaultDocumentTextExtractor();
      const ingestion = new IngestionService(repo, storage, extractor);
      await ingestion.ingestSource(s.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doResolveUnavailable = (
    s: InputSource,
    resolution: "manual_evidence_added" | "source_replaced" | "source_excluded_with_reason",
  ) => {
    if (readOnly) return;
    const repo = getDefaultRepository();
    const store = repo.load();
    const row = store.sources.find((x) => x.id === s.id);
    if (!row) return;
    row.unavailableResolution = resolution;
    repo.save(store);
    void refresh();
  };

  const counts = {
    total: sources.length,
    ready: sources.filter((s) => s.extractionStage === "text_extracted").length,
    pending: sources.filter((s) => s.extractionStage === "not_started").length,
    attention: sources.filter(
      (s) => s.extractionStage === "failed" || s.extractionStage === "text_unavailable",
    ).length,
  };

  const isSettled = (s: InputSource): boolean =>
    s.extractionStage === "text_extracted" ||
    (s.extractionStage === "text_unavailable" && !!s.unavailableResolution);
  const planFirst = (a: InputSource, b: InputSource) =>
    a.type === "plan" ? -1 : b.type === "plan" ? 1 : 0;
  const activeSources = [...sources].filter((s) => !isSettled(s)).sort(planFirst);
  const settledSources = [...sources].filter(isSettled).sort(planFirst);
  const attentionSources = activeSources.filter(
    (s) => s.extractionStage === "failed" || s.extractionStage === "text_unavailable",
  );
  const previewSource = openPreview ? (sources.find((s) => s.id === openPreview) ?? null) : null;

  const renderSourceCard = (s: InputSource) => {
    const chunks = chunksBySource[s.id] ?? [];
    const stageLabel = EXTRACTION_STAGE_LABELS_AR[s.extractionStage];
    return (
      <li key={s.id} className="rounded-md border border-border p-4" data-source-id={s.id}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">
              {SOURCE_TYPE_LABELS_AR[s.type]} — {s.fileName}
            </div>
            <div className="text-xs text-muted-foreground">حالة التجهيز: {stageLabel}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.manualTextArtifactId ? null : (
              <button
                type="button"
                disabled={readOnly || busy !== null || !s.storagePath}
                onClick={() => void doIngest(s)}
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {s.extractionStage === "not_started"
                  ? "تجهيز النص"
                  : s.extractionStage === "failed"
                    ? "إعادة المحاولة"
                    : "إعادة تجهيز النص"}
              </button>
            )}
            {chunks.length > 0 && (
              <button
                type="button"
                ref={(el) => {
                  previewOpenerRefs.current[s.id] = el;
                }}
                data-testid={`open-preview-${s.id}`}
                aria-expanded={openPreview === s.id}
                onClick={() => {
                  activeOpenerRef.current = previewOpenerRefs.current[s.id] ?? null;
                  setOpenPreview(s.id);
                }}
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
              >
                معاينة النص
              </button>
            )}
            <Link
              to="/cases/$caseId/sources"
              params={{ caseId }}
              className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
            >
              العودة للمصدر
            </Link>
          </div>
        </div>

        {s.extractionStage === "text_unavailable" && !s.unavailableResolution && (
          <div
            role="alert"
            data-testid={`unavailable-${s.id}`}
            className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            <p className="mb-2 font-medium">لا يوجد نص قابل للاستخراج. اختر معالجة:</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => doResolveUnavailable(s, "source_replaced")}
                className="rounded-md border border-input bg-background px-2 py-1 hover:bg-accent"
              >
                استبدال المصدر
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => doResolveUnavailable(s, "manual_evidence_added")}
                className="rounded-md border border-input bg-background px-2 py-1 hover:bg-accent"
              >
                إضافة دليل يدوي
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => doResolveUnavailable(s, "source_excluded_with_reason")}
                className="rounded-md border border-input bg-background px-2 py-1 hover:bg-accent"
              >
                استبعاد مع سبب
              </button>
            </div>
          </div>
        )}
        {s.extractionStage === "text_unavailable" && s.unavailableResolution && (
          <p className="mt-2 text-xs text-muted-foreground">تمت معالجة غياب النص.</p>
        )}
      </li>
    );
  };

  return (
    <WorkflowShell caseId={caseId} currentStep="text" width="regular">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="قراءة محتوى الخطة"
        stepIndicatorAr="الخطوة 3 من 8"
        descriptionAr="يقرأ النظام محتوى الملفات تلقائيًا ليتمكن من عرض بنود الخطة عليك."
        requiredNowAr={
          autoRunning
            ? "جارٍ قراءة محتوى الملفات…"
            : counts.ready > 0
              ? "تمت قراءة المحتوى. تابع إلى مراجعة بنود الخطة."
              : "اضغط قراءة المحتوى، أو عالج الملفات غير القابلة للقراءة."
        }
        trailing={
          <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
            العودة إلى ملخص الحالة
          </Link>
        }
      />

      {sources.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          لا توجد مصادر مسجلة بعد.{" "}
          <Link to="/cases/$caseId/sources" params={{ caseId }} className="underline">
            إضافة مصادر
          </Link>
        </div>
      ) : planBlobMissing ? (
        <div
          role="alert"
          data-testid="plan-blob-missing"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="font-medium">سجل الخطة موجود، لكن ملفها المحلي غير قابل للقراءة.</p>
          <p className="mt-1 text-xs">استبدل ملف الخطة من صفحة المصادر لإعادة تفعيل تجهيز النص.</p>
          <Link
            to="/cases/$caseId/sources"
            params={{ caseId }}
            className="mt-2 inline-flex rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            الذهاب إلى المصادر لاستبدال ملف الخطة
          </Link>
        </div>
      ) : (
        <>
          {(autoRunning || counts.pending > 0) && (
            <div
              className="mb-4 flex items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
              role="status"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500"
              />
              جارٍ قراءة محتوى الخطة تلقائيًا…
            </div>
          )}

          {attentionSources.length > 0 && (
            <section className="mb-4" aria-labelledby="attention-title">
              <h2 id="attention-title" className="mb-2 text-base font-semibold">
                مطلوب منك معالجة {attentionSources.length} من الملفات
              </h2>
              <ul className="space-y-3">{attentionSources.map(renderSourceCard)}</ul>
            </section>
          )}

          {activeSources.length === 0 && (
            <div
              className="mb-4 flex items-center gap-2 text-sm text-emerald-800"
              data-testid="ingestion-all-settled"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700"
              >
                ✓
              </span>
              تمت قراءة الخطة وأصبحت جاهزة للمراجعة.
            </div>
          )}

          <button
            type="button"
            data-testid="ingestion-details-toggle"
            aria-expanded={detailsOpen}
            aria-controls="ingestion-details"
            onClick={() => setDetailsOpen((open) => !open)}
            className="mt-2 text-sm text-primary underline underline-offset-4"
          >
            {detailsOpen ? "إخفاء تفاصيل القراءة" : "عرض تفاصيل القراءة"}
          </button>

          {detailsOpen && (
            <div id="ingestion-details" className="mt-4 space-y-4">
              <section
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                data-testid="ingestion-counters"
              >
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">ملفات تمت قراءتها</div>
                  <div className="mt-1 text-lg font-semibold">{counts.ready}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">بانتظار القراءة</div>
                  <div className="mt-1 text-lg font-semibold">{counts.pending}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">تحتاج انتباهًا</div>
                  <div className="mt-1 text-lg font-semibold">{counts.attention}</div>
                </div>
              </section>
              {settledSources.length > 0 && (
                <section data-testid="ingestion-settled-section">
                  <h2 className="mb-2 text-sm font-medium">
                    الملفات المقروءة ({settledSources.length})
                  </h2>
                  <ul className="space-y-3">{settledSources.map(renderSourceCard)}</ul>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {previewSource && (
        <ResponsivePanel
          open
          data-testid={`preview-panel-${previewSource.id}`}
          titleAr={`معاينة النص — ${previewSource.fileName}`}
          descriptionAr="مقتطفات النص المستخرج مع موضع كل مقتطف."
          onClose={() => setOpenPreview(null)}
          returnFocusTo={activeOpenerRef}
        >
          <ul className="space-y-2 text-xs">
            {(chunksBySource[previewSource.id] ?? []).map((ch) => (
              <li key={ch.chunkId} className="rounded-md border border-border/60 bg-muted/30 p-2">
                <div className="text-muted-foreground">{locatorLabel(ch.locator)}</div>
                <div className="mt-0.5 whitespace-pre-wrap">
                  {ch.text.length > 300 ? ch.text.slice(0, 300) + "…" : ch.text}
                </div>
              </li>
            ))}
          </ul>
        </ResponsivePanel>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <StageFooter
        backHref={`/cases/${caseId}/sources`}
        backLabelAr="السابق: الخطة"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="مراجعة بنود الخطة"
        continueHref={`/cases/${caseId}/extraction`}
        continueDisabled={activeSources.length > 0 || autoRunning}
        continueDisabledReasonAr="انتظر اكتمال قراءة الخطة أو عالج الملفات التي تحتاج إلى انتباه."
        continueHintAr="ستنتقل إلى تأكيد الأدلة المستخرجة من الخطة قبل تحديد نطاق المراجعة."
      />
    </WorkflowShell>
  );
}
