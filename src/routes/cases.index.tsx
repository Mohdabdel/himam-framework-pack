import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseService,
  formatArabicDate,
  phaseLabelAr,
  resolveCaseNextAction,
  statusLabelAr,
} from "@/features/himam";
import type { CaseNextAction, ReviewCase } from "@/features/himam";

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

function CasesDashboard() {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [next, setNext] = useState<Record<string, CaseNextAction>>({});
  useEffect(() => {
    const list = new CaseService().list();
    setCases(list);
    const map: Record<string, CaseNextAction> = {};
    for (const c of list) map[c.id] = resolveCaseNextAction(c.id);
    setNext(map);
  }, []);
  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-6 py-10 font-sans">
      <header className="mb-8 rounded-lg border border-border bg-card p-6">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
          HIMAM — مراجعة الخطط التربوية
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground">ابدأ مراجعة خطة تربوية</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          أنشئ حالة مراجعة، ارفع ملف الخطة التربوية، ثم تابع رحلة المراجعة خطوة بخطوة حتى
          التقرير.
        </p>
        {cases.length > 0 && (
          <Link
            to="/cases/new"
            data-testid="start-review-cta"
            className="mt-4 min-h-11 inline-flex items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            إنشاء حالة مراجعة جديدة
          </Link>
        )}
      </header>
      {cases.length === 0 ? (
        <div
          data-testid="cases-empty-state"
          className="rounded-lg border border-dashed border-border p-10 text-center"
        >
          <p className="text-sm text-muted-foreground">
            لا توجد حالات مراجعة بعد. ابدأ بإنشاء حالة لخطة واحدة.
          </p>
          <Link
            to="/cases/new"
            className="mt-4 min-h-11 inline-flex items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            إنشاء حالة مراجعة جديدة
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {cases.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {c.referenceCode}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {statusLabelAr(c.status)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {c.planType ?? "نوع الخطة غير محدد"} · {phaseLabelAr(c.phaseId)} · آخر تحديث{" "}
                  {formatArabicDate(c.updatedAt ?? c.createdAt)}
                </div>
                <div className="mt-1 text-xs text-foreground">
                  الخطوة الحالية: {next[c.id]?.stateSummaryAr ?? "قيد التحديث."}
                </div>
              </div>
              <Link
                to="/cases/$caseId"
                params={{ caseId: c.id }}
                className="min-h-11 inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                متابعة
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10 border-t border-border pt-4 text-center">
        <Link
          to="/framework-package"
          data-testid="framework-package-link"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          فتح حزمة HIMAM المرجعية
        </Link>
      </div>
    </div>
  );
}
