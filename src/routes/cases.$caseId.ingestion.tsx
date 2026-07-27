import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AppShell,
  CaseService,
  DefaultDocumentTextExtractor,
  EXTRACTION_STAGE_LABELS_AR,
  IngestionService,
  StageFooter,
  StageHeader,
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

  const refresh = () => {
    const svc = new CaseService();
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
  };
  useEffect(() => {
    refresh();
  }, [caseId]);

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
      refresh();
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
    refresh();
  };

  return (
    <AppShell width="regular">
      <StageHeader
        caseCodeAr={c.referenceCode}
        titleAr="تجهيز النصوص"
        stepIndicatorAr="الخطوة 3 من 8"
        descriptionAr="تحويل ملفات المصادر إلى نص قابل للاستخدام في استخراج الأدلة."
        requiredNowAr="جهّز نص كل مصدر أو اتخذ قرارًا صريحًا للمصادر غير القابلة للاستخراج."
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
      ) : (
        <ul className="space-y-3">
          {sources.map((s) => {
            const chunks = chunksBySource[s.id] ?? [];
            const stageLabel = EXTRACTION_STAGE_LABELS_AR[s.extractionStage];
            return (
              <li key={s.id} className="rounded-md border border-border p-4" data-source-id={s.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
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
                        onClick={() => setOpenPreview(openPreview === s.id ? null : s.id)}
                        className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                      >
                        {openPreview === s.id ? "إخفاء المعاينة" : "معاينة النص"}
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

                {s.extractionStage === "text_unavailable" && (
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
                    {s.unavailableResolution && <p className="mt-2 text-xs">تمت المعالجة.</p>}
                  </div>
                )}

                {openPreview === s.id && chunks.length > 0 && (
                  <ul className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                    {chunks.map((ch) => (
                      <li key={ch.chunkId}>
                        <div className="text-muted-foreground">{locatorLabel(ch.locator)}</div>
                        <div className="mt-0.5 whitespace-pre-wrap">
                          {ch.text.length > 300 ? ch.text.slice(0, 300) + "…" : ch.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <StageFooter
        backHref={`/cases/${caseId}/sources`}
        backLabelAr="السابق: المصادر"
        returnToCaseHref={`/cases/${caseId}`}
        continueLabelAr="الانتقال إلى استخراج الأدلة"
        continueHref={`/cases/${caseId}/extraction`}
      />
    </AppShell>
  );
}
