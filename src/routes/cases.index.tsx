import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CaseService } from "@/features/himam";
import type { ReviewCase } from "@/features/himam";

export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "حالات المراجعة — HIMAM" },
      {
        name: "description",
        content: "قائمة حالات المراجعة الخاصة بحزمة HIMAM 1A.",
      },
      { property: "og:title", content: "حالات المراجعة — HIMAM" },
      {
        property: "og:description",
        content: "قائمة حالات المراجعة الخاصة بحزمة HIMAM 1A.",
      },
    ],
  }),
  component: CasesDashboard,
});

const STATUS_LABEL: Record<ReviewCase["status"], string> = {
  draft: "مسودة",
  minimum_inputs_complete: "المدخلات الدنيا مكتملة",
  scope_confirmed: "النطاق مؤكد",
  closed: "مغلقة",
};

function CasesDashboard() {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  useEffect(() => {
    setCases(new CaseService().list());
  }, []);
  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-6 py-10 font-sans">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة حالات المراجعة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            HIMAM Package 1A — Foundation. لا استخراج ولا مراجعة ولا تقرير في هذه الجولة.
          </p>
        </div>
        <Link
          to="/cases/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          إنشاء حالة مراجعة
        </Link>
      </header>
      {cases.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-muted-foreground">
          لا توجد حالات مراجعة بعد. ابدأ بإنشاء حالة لخطة واحدة.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {cases.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <div className="font-semibold">{c.referenceCode}</div>
                <div className="text-xs text-muted-foreground">
                  {c.ageYears !== null ? `العمر: ${c.ageYears}` : "بلا عمر"} ·{" "}
                  {c.phaseId ?? "بلا مرحلة"} · {c.planType ?? "بلا نوع خطة"}
                </div>
                <div className="text-xs text-muted-foreground">
                  الحالة: {STATUS_LABEL[c.status]} · أنشئت{" "}
                  {new Date(c.createdAt).toLocaleDateString("ar")}
                </div>
              </div>
              <Link
                to="/cases/$caseId"
                params={{ caseId: c.id }}
                className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
              >
                فتح الحالة
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/" className="underline">
          العودة إلى صفحة حزمة ما قبل البرمجة
        </Link>
      </div>
    </div>
  );
}
