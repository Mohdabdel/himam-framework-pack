import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseService,
  DefaultDocumentTextExtractor,
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
import type { InputSource, InputSourceType, ReviewCase } from "@/features/himam";

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
  const [addType, setAddType] = useState<InputSourceType>("plan");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addManualText, setAddManualText] = useState<string>("");

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    setSources(svc.sourcesFor(caseId));
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
  const isManual = MANUAL_TEXT_SOURCE_TYPES.includes(addType);
  const isSingle = SINGLE_ACTIVE_SOURCE_TYPES.includes(addType);
  const hasActiveOfType = sources.some((s) => s.type === addType);

  const onAdd = async (replaceId?: string) => {
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
        <h1 className="text-2xl font-bold">إدارة المصادر</h1>
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

      <section className="space-y-4">
        {SOURCE_TYPES_ORDER.map((t) => {
          const items = sources.filter((s) => s.type === t);
          return (
            <div key={t} className="rounded-md border border-border p-4" data-source-type={t}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{SOURCE_TYPE_LABELS_AR[t]}</h2>
                <span className="text-xs text-muted-foreground">
                  {SINGLE_ACTIVE_SOURCE_TYPES.includes(t) ? "مصدر نشط واحد" : "مصدر أو أكثر"}
                </span>
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
              value={addType}
              onChange={(e) => setAddType(e.target.value as InputSourceType)}
              disabled={readOnly || busy}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SOURCE_TYPES_ORDER.map((t) => (
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
        <Link
          to="/cases/$caseId/ingestion"
          params={{ caseId }}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
        >
          الانتقال إلى تجهيز النصوص
        </Link>
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
