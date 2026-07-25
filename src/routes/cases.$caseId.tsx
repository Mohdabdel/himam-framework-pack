import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseExtractionService,
  CaseService,
  CASE_STAGE_LABELS_AR,
  STATUS_BADGE_CLASSES,
  detectPhaseAgeInconsistency,
  formatArabicDate,
  getDefaultRepository,
  phaseLabelAr,
  shortCaseId,
  statusLabelAr,
} from "@/features/himam";
import type {
  ExtractedEvidence,
  InputSource,
  ReviewCase,
  ReviewScopeSnapshot,
} from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "حالة مراجعة — HIMAM" },
      { name: "description", content: "ملخص حالة مراجعة داخل HIMAM 1A." },
      { property: "og:title", content: "حالة مراجعة — HIMAM" },
      { property: "og:description", content: "ملخص حالة مراجعة داخل HIMAM 1A." },
    ],
  }),
  component: CaseDetail,
});

const DOMAIN_LABEL: Record<string, string> = {
  D0: "D0 — قابلية المراجعة",
  D1: "D1 — بنية الهدف",
  D2: "D2 — التخصيص وقاعدة الأدلة",
  D3: "D3 — القيمة التعليمية/الوظيفية",
  D4: "D4 — الدعم والتنفيذ",
  D5: "D5 — الأسرة والمتعلم والسياق",
  D6: "D6 — المواءمة العمرية والمآلات",
  D7: "D7 — ترابط الأهداف",
  D8: "D8 — جاهزية الرصد",
};

function CaseDetail() {
  const { caseId } = Route.useParams();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [scope, setScope] = useState<ReviewScopeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastConfirmedScope, setLastConfirmedScope] = useState<ReviewScopeSnapshot | null>(null);
  const [evidenceCount, setEvidenceCount] = useState({ total: 0, pending: 0, confirmed: 0 });
  const [completeStatus, setCompleteStatus] = useState<
    ReturnType<CaseExtractionService["canCompleteExtractionConfirmation"]> | null
  >(null);

  const refresh = async () => {
    const svc = new CaseService();
    await svc.reconcile();
    setC(svc.get(caseId));
    setSources(svc.sourcesFor(caseId));
    setScope(svc.latestScope(caseId));
    setLastConfirmedScope(svc.lastConfirmedScope(caseId));
    const repo = getDefaultRepository();
    const store = repo.load();
    const list = store.extractedEvidence.filter((e) => e.reviewCaseId === caseId);
    setEvidenceCount({
      total: list.length,
      pending: list.filter((e) => e.status === "pending").length,
      confirmed: list.filter((e) => e.status === "confirmed" || e.status === "edited").length,
    });
    const cx = new CaseExtractionService(repo);
    setCompleteStatus(cx.canCompleteExtractionConfirmation(caseId));
  };
  useEffect(() => {
    void refresh();
  }, [caseId]);

  if (!c) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
        <Link to="/cases" className="text-sm underline">
          العودة إلى اللوحة
        </Link>
      </div>
    );
  }

  const svc = new CaseService();
  const canGenerate = c.status === "minimum_inputs_complete" || c.status === "scope_confirmed";
  const canConfirm = c.status === "minimum_inputs_complete" && !!scope;
  const canClose = c.status === "scope_confirmed";

  const doReconfirmScope = () => {
    setError(null);
    try {
      svc.reconfirmScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doGenerate = () => {
    setError(null);
    try {
      svc.generateScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doConfirm = () => {
    setError(null);
    try {
      svc.confirmScope(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doClose = () => {
    setError(null);
    try {
      svc.closeCase(caseId);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doRemove = async (sourceId: string) => {
    setError(null);
    try {
      await svc.removeSource(sourceId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-6 py-10 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">حالة مراجعة {c.referenceCode}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>المعرّف المختصر: {shortCaseId(c)}</span>
            <span>·</span>
            <span className={`rounded-full border px-2 py-0.5 ${STATUS_BADGE_CLASSES[c.status]}`}>
              {statusLabelAr(c.status)}
            </span>
          </div>
        </div>
        <Link to="/cases" className="text-sm underline">
          العودة
        </Link>
      </div>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">البيانات الأساسية</h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">العمر</dt>
            <dd>{c.ageYears !== null ? `${c.ageYears} سنة` : "غير محدد"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">المرحلة</dt>
            <dd>{phaseLabelAr(c.phaseId)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">نوع الخطة</dt>
            <dd>{c.planType ?? "غير محدد"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">الحالة</dt>
            <dd>{statusLabelAr(c.status)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
            <dd>{formatArabicDate(c.createdAt)}</dd>
          </div>
        </dl>
        {detectPhaseAgeInconsistency(c.ageYears, c.phaseId) && (
          <div
            role="note"
            data-testid="phase-age-warning"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            يرجى مراجعة المرحلة المختارة.
          </div>
        )}
      </section>

        <section className="mb-6 rounded-md border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">رحلة الحالة</h2>
          </div>
          <ol className="space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-md border border-border/60 p-2">
              <span>البيانات الأساسية</span>
              <Link
                to="/cases/$caseId/sources"
                params={{ caseId }}
                className="text-xs underline"
              >
                إدارة المصادر
              </Link>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border/60 p-2">
              <span>
                تجهيز النصوص —{" "}
                {sources.filter((s) => s.extractionStage === "text_extracted").length}/
                {sources.length}
              </span>
              <Link
                to="/cases/$caseId/ingestion"
                params={{ caseId }}
                className="text-xs underline"
              >
                فتح
              </Link>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border/60 p-2">
              <span>
                تأكيد الأدلة — {evidenceCount.confirmed}/{evidenceCount.total} (معلق:{" "}
                {evidenceCount.pending})
              </span>
              <Link
                to="/cases/$caseId/extraction"
                params={{ caseId }}
                className="text-xs underline"
              >
                فتح
              </Link>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border/60 p-2 text-muted-foreground">
              <span>
                مرحلة المعالجة الحالية: {CASE_STAGE_LABELS_AR[c.extractionStage]}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-dashed border-border/60 p-2 text-muted-foreground">
              <span>مراجعة جودة الخطة</span>
              <span className="text-xs">مقفل</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-dashed border-border/60 p-2 text-muted-foreground">
              <span>التقرير</span>
              <span className="text-xs">مقفل</span>
            </li>
          </ol>
          {completeStatus && !completeStatus.ok && c.extractionStage !== "extraction_confirmed" && (
            <p className="mt-2 text-xs text-amber-700" data-testid="journey-blocker">
              متعذر إكمال تأكيد الاستخراج: {completeStatus.reason}
            </p>
          )}
        </section>

        {c.scopeNeedsReconfirmation && lastConfirmedScope && scope && (
          <section
            className="mb-6 rounded-md border border-amber-200 bg-amber-50/50 p-4"
            data-testid="scope-diff-section"
          >
            <h2 className="mb-2 text-lg font-semibold text-amber-900">
              إعادة تأكيد نطاق المراجعة
            </h2>
            <p className="mb-2 text-xs text-amber-800">
              تغيّرت المصادر منذ آخر تأكيد. راجع الفروق قبل الإكمال.
            </p>
            <ScopeDiff previous={lastConfirmedScope} draft={scope} />
            <button
              type="button"
              onClick={doReconfirmScope}
              className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              تأكيد نطاق المراجعة المحدَّث
            </button>
          </section>
        )}

        <section className="mb-6 rounded-md border border-border p-4">
          <h2 className="mb-2 text-lg font-semibold">مصادر المراجعة</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يُسجَّل أي مصدر. الخطة إلزامية للانتقال إلى المدخلات الدنيا.
          </p>
        ) : (
          <ul className="text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-1">
                <span className="min-w-0 truncate">
                  {s.type} — {s.fileName}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      s.status === "file_missing"
                        ? "text-destructive"
                        : s.status === "unreadable"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }
                  >
                    {s.status === "ready_for_future_ingestion"
                      ? "محفوظ محليًا"
                      : s.status === "file_missing"
                        ? "الملف مفقود"
                        : s.status === "unreadable"
                          ? "غير قابل للقراءة"
                          : "مسجَّل بدون ملف"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void doRemove(s.id)}
                    className="rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    إزالة
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          الملف يُحفظ محليًا داخل المتصفح (IndexedDB) ولا يُرفع لأي خدمة خارجية ولا يتاح كرابط عام.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          المصادر الأخرى (تقييم، أولويات الأسرة، تفضيلات المتعلم، الدعم، ملاحظات مهنية، خطة سابقة،
          تقدم سابق) مقفلة للحزم التالية.
        </p>
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">نطاق المراجعة المبدئي</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          هذه ليست نتائج مراجعة. إنها حدود المراجعة التي ستصبح ممكنة بعد تنفيذ الحزم التالية.
        </p>
        {scope ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">المدخلات المتاحة:</div>
              <div className="text-muted-foreground">{scope.inputTypes.join("، ") || "—"}</div>
            </div>
            <div>
              <div className="font-medium">المجالات المتاحة:</div>
              <ul className="list-inside list-disc text-muted-foreground">
                {scope.availableDomains.map((d) => (
                  <li key={d}>{DOMAIN_LABEL[d] ?? d}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium">
                المجالات غير القابلة للمراجعة (بسبب غياب مدخل اختياري):
              </div>
              <ul className="list-inside list-disc text-muted-foreground">
                {scope.notReviewableDomains.map((d) => (
                  <li key={d}>{DOMAIN_LABEL[d] ?? d}</li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-muted-foreground">
              تاريخ الإنشاء: {new Date(scope.createdAt).toLocaleString("ar")} ·
              {scope.confirmedAt
                ? ` مؤكد في ${new Date(scope.confirmedAt).toLocaleString("ar")}`
                : " غير مؤكد"}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            لم يُولَّد نطاق بعد. أكمل المدخلات الدنيا ثم اضغط "توليد النطاق".
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={doGenerate}
            disabled={!canGenerate}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            توليد النطاق
          </button>
          <button
            onClick={doConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            تأكيد نطاق المراجعة
          </button>
          <button
            onClick={doClose}
            disabled={!canClose}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            إغلاق الحالة
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>

      <section className="rounded-md border border-dashed border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">خطوات مقفلة</h2>
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          <li>استخراج المعلومات — مقفل (Package 1B).</li>
          <li>تشغيل معايير المراجعة — مقفل.</li>
          <li>توليد التقرير — مقفل.</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">لم تُنفذ مراجعة الخطة بعد.</p>
      </section>
    </div>
  );
}
