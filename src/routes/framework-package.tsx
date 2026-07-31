import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import JSZip from "jszip";
import { PACKAGE_FILES, PACKAGE_FOLDER, BOM } from "@/lib/himam-package/files";

export const Route = createFileRoute("/framework-package")({
  head: () => ({
    meta: [
      { title: "HIMAM Pre-Programming Package v1.0" },
      {
        name: "description",
        content: "حزمة الملفات المعرفية والتشغيلية الكاملة قبل برمجة محرك HIMAM.",
      },
      { property: "og:title", content: "HIMAM Pre-Programming Package v1.0" },
      {
        property: "og:description",
        content: "حزمة الملفات المعرفية والتشغيلية الكاملة قبل برمجة محرك HIMAM.",
      },
    ],
  }),
  component: FrameworkPackagePage,
});

function FrameworkPackagePage() {
  const [busy, setBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [supplementBusy, setSupplementBusy] = useState(false);

  const fileContent = (f: (typeof PACKAGE_FILES)[number]) =>
    f.isCsv ? BOM + f.content : f.content;

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOne = (f: (typeof PACKAGE_FILES)[number]) => {
    const blob = new Blob([fileContent(f)], { type: `${f.mime};charset=utf-8` });
    triggerDownload(blob, f.name);
  };

  const downloadZip = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(PACKAGE_FOLDER)!;
      for (const f of PACKAGE_FILES) {
        folder.file(f.name, fileContent(f));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${PACKAGE_FOLDER}.zip`);
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = async (
    path: string,
    filename: string,
    setBusyState: (value: boolean) => void,
  ) => {
    setBusyState(true);
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`فشل التنزيل: ${res.status}`);
      const blob = await res.blob();
      triggerDownload(blob, filename);
    } finally {
      setBusyState(false);
    }
  };

  const downloadAuditReport = async () => {
    await downloadFile(
      "/HIMAM_CURRENT_IMPLEMENTATION_AUDIT.md",
      "HIMAM_CURRENT_IMPLEMENTATION_AUDIT.md",
      setAuditBusy,
    );
  };

  const downloadSupplementReport = async () => {
    await downloadFile(
      "/HIMAM_CURRENT_IMPLEMENTATION_AUDIT_SUPPLEMENT.md",
      "HIMAM_CURRENT_IMPLEMENTATION_AUDIT_SUPPLEMENT.md",
      setSupplementBusy,
    );
  };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 border-b border-border pb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            CONDITIONAL GO — راجع تقرير الجاهزية (الملف 18)
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HIMAM Pre-Programming Package v1.0</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            حزمة الملفات المعرفية والتشغيلية الكاملة الواجب اعتمادها قبل الشروع في برمجة محرك HIMAM.
            الغرض الوحيد لهذه الأداة هو إنتاج ملف ZIP قابل للتنزيل يحتوي على {PACKAGE_FILES.length}{" "}
            ملفًا بترميز UTF-8، وملفات CSV بـ BOM لضمان الفتح العربي.
          </p>
          <div className="mt-4">
            <Link
              to="/cases"
              className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              data-testid="back-to-cases"
            >
              العودة إلى لوحة حالات المراجعة
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-primary">تقرير التدقيق التنفيذي</div>
              <p className="mt-1 text-sm text-muted-foreground">
                تقرير قراءة وتشخيص كامل للحالة البرمجية الفعلية لمشروع HIMAM Framework Pack.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadAuditReport}
              disabled={auditBusy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              data-testid="download-audit-report"
            >
              {auditBusy ? "جارٍ التحضير..." : "تنزيل التقرير الكامل"}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">ملحق تقرير التدقيق التنفيذي</div>
              <p className="mt-1 text-sm text-muted-foreground">
                استكمال إلزامي يوضح الفروقات بين بيانات المعاينة والنسخ المحفوظة، والأحكام النهائية
                للجاهزية.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadSupplementReport}
              disabled={supplementBusy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              data-testid="download-audit-supplement"
            >
              {supplementBusy ? "جارٍ التحضير..." : "تنزيل الملحق الكامل"}
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">المحتوى</div>
              <div className="mt-1 text-lg font-semibold">
                18 ملفًا معرفيًا/تشغيليًا + Traceability (17) + Readiness (18) + Package 1A (19) +
                README/MANIFEST = {PACKAGE_FILES.length} ملفًا
              </div>
            </div>
            <button
              type="button"
              onClick={downloadZip}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "جارٍ التحضير..." : "تنزيل الحزمة الكاملة (ZIP)"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-6 py-4 text-sm font-semibold">
            قائمة الملفات
          </div>
          <ul className="divide-y divide-border">
            {PACKAGE_FILES.map((f, i) => (
              <li key={f.name} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-6 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="truncate font-mono text-sm">{f.name}</span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {f.isCsv ? "CSV" : "MD"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadOne(f)}
                  className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  تنزيل
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          الإصدار 1.0 — المشروع خاص وغير منشور.
        </footer>
      </div>
    </div>
  );
}
