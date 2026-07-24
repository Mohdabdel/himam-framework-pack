import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CaseService } from "@/features/himam";
import type {
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
  const navigate = useNavigate();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [sources, setSources] = useState<InputSource[]>([]);
  const [scope, setScope] = useState<ReviewScopeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    const svc = new CaseService();
    setC(svc.get(caseId));
    setSources(svc.sourcesFor(caseId));
    setScope(svc.latestScope(caseId));
  };
  useEffect(() => {
    refresh();
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
  const canGenerate =
    c.status === "minimum_inputs_complete" || c.status === "scope_confirmed";
  const canConfirm = c.status === "minimum_inputs_complete" && !!scope;
  const canClose = c.status === "scope_confirmed";

  const doGenerate = () => {
    setError(null);
    try {
      svc.generateScope(caseId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doConfirm = () => {
    setError(null);
    try {
      svc.confirmScope(caseId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const doClose = () => {
    setError(null);
    try {
      svc.closeCase(caseId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-6 py-10 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">حالة مراجعة {c.referenceCode}</h1>
          <p className="text-xs text-muted-foreground">
            إصدار المعرفة: {c.knowledgePackageVersion} · الحالة: {c.status}
          </p>
        </div>
        <Link to="/cases" className="text-sm underline">
          العودة
        </Link>
      </div>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">البيانات الأساسية</h2>
        <ul className="text-sm text-muted-foreground">
          <li>العمر: {c.ageYears ?? "غير محدد"}</li>
          <li>المرحلة: {c.phaseId ?? "غير محددة"}</li>
          <li>نوع الخطة: {c.planType ?? "غير محدد"}</li>
        </ul>
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">مصادر المراجعة</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يُسجَّل أي مصدر. الخطة إلزامية للانتقال إلى المدخلات الدنيا.
          </p>
        ) : (
          <ul className="text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex justify-between py-1">
                <span>
                  {s.type} — {s.fileName}
                </span>
                <span className="text-muted-foreground">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          المصادر الأخرى (تقييم، أولويات الأسرة، تفضيلات المتعلم، الدعم،
          ملاحظات مهنية، خطة سابقة، تقدم سابق) مقفلة للحزم التالية.
        </p>
      </section>

      <section className="mb-6 rounded-md border border-border p-4">
        <h2 className="mb-2 text-lg font-semibold">نطاق المراجعة المبدئي</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          هذه ليست نتائج مراجعة. إنها حدود المراجعة التي ستصبح ممكنة بعد
          تنفيذ الحزم التالية.
        </p>
        {scope ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">المدخلات المتاحة:</div>
              <div className="text-muted-foreground">
                {scope.inputTypes.join("، ") || "—"}
              </div>
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
        <p className="mt-3 text-xs text-muted-foreground">
          لم تُنفذ مراجعة الخطة بعد.
        </p>
      </section>
    </div>
  );
}