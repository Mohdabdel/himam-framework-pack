import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CaseService,
  STATUS_BADGE_CLASSES,
  detectPhaseAgeInconsistency,
  formatArabicDate,
  phaseLabelAr,
  shortCaseId,
  statusLabelAr,
} from "@/features/himam";
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

function CasesDashboard() {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  useEffect(() => {
    setCases(new CaseService().list());
  }, []);
  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-6 py-10 font-sans">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ابدأ مراجعة خطة تربوية</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            أنشئ حالة مراجعة، ارفع ملف الخطة التربوية، ثم تابع رحلة المراجعة خطوة بخطوة حتى
            التقرير.
          </p>
        </div>
        <Link
          to="/cases/new"
          data-testid="start-review-cta"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          إنشاء حالة مراجعة جديدة
        </Link>
      </header>
      {cases.length === 0 ? (
        <div
          data-testid="cases-empty-state"
          className="rounded-md border border-dashed border-border p-10 text-center"
        >
          <p className="text-sm text-muted-foreground">
            لا توجد حالات مراجعة بعد. ابدأ بإنشاء حالة لخطة واحدة.
          </p>
          <Link
            to="/cases/new"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            إنشاء حالة مراجعة جديدة
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cases.map((c) => {
            const inconsistent = detectPhaseAgeInconsistency(c.ageYears, c.phaseId);
            return (
              <li key={c.id} className="rounded-md border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">{c.referenceCode}</div>
                    <div className="text-[11px] text-muted-foreground">
                      المعرّف المختصر: {shortCaseId(c)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGE_CLASSES[c.status]}`}
                  >
                    {statusLabelAr(c.status)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">العمر</dt>
                  <dd>{c.ageYears !== null ? `${c.ageYears} سنة` : "غير محدد"}</dd>
                  <dt className="text-muted-foreground">المرحلة</dt>
                  <dd>{phaseLabelAr(c.phaseId)}</dd>
                  <dt className="text-muted-foreground">نوع الخطة</dt>
                  <dd>{c.planType ?? "غير محدد"}</dd>
                  <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
                  <dd>{formatArabicDate(c.createdAt)}</dd>
                </dl>
                {inconsistent && (
                  <div
                    role="note"
                    className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    data-testid="phase-age-warning"
                  >
                    يرجى مراجعة المرحلة المختارة.
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    فتح الحالة
                  </Link>
                </div>
              </li>
            );
          })}
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
