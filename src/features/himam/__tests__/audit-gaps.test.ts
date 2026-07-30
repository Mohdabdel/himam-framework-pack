// جولة الفجوات المؤكدة G1–G4 (تدقيق داخلي): عرض عدم اليقين، تعريب حالة
// نسخة التقرير، حراسة زر الطباعة، وإزالة عنصر التنقل الميت في شاشة النطاق.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REPORT_VERSION_STATUS_LABELS_AR, UNCERTAINTY_LABELS_AR } from "../review/review-labels";

function read(p: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
}

describe("HIMAM — الفجوات المؤكدة G1–G4", () => {
  const reviewSrc = read("src/routes/cases.$caseId.review.tsx");
  const reportSrc = read("src/routes/cases.$caseId.report.tsx");
  const scopeSrc = read("src/routes/cases.$caseId.scope.tsx");

  it("T-U1: بطاقة الملاحظة تعرض درجة عدم اليقين بتسمية عربية", () => {
    expect(UNCERTAINTY_LABELS_AR.high).toBe("عالية");
    expect(UNCERTAINTY_LABELS_AR.medium).toBe("متوسطة");
    expect(UNCERTAINTY_LABELS_AR.low).toBe("منخفضة");
    expect(reviewSrc).toContain('data-testid="finding-uncertainty"');
    expect(reviewSrc).toContain("UNCERTAINTY_LABELS_AR[f.uncertainty]");
  });

  it("T-U2: عنصر التقرير يعرض القيمة المخزّنة نفسها لعدم اليقين", () => {
    expect(reportSrc).toContain('data-testid="report-item-uncertainty"');
    expect(reportSrc).toContain("UNCERTAINTY_LABELS_AR[item.uncertainty]");
  });

  it("T-U3: لا تُطبع قيمة عدم اليقين الإنجليزية الخام", () => {
    expect(reviewSrc).not.toMatch(/\{f\.uncertainty\}/);
    expect(reportSrc).not.toMatch(/\{item\.uncertainty\}/);
  });

  it("T-L1: حالة نسخة التقرير تُعرض عبر القاموس العربي لا بقيمتها التقنية", () => {
    expect(reportSrc).not.toContain("<dd>{active.status}</dd>");
    expect(reportSrc).toContain('data-testid="report-version-status"');
    expect(reportSrc).toContain("REPORT_VERSION_STATUS_LABELS_AR[active.status]");
    expect(reportSrc).toContain("REPORT_VERSION_STATUS_LABELS_AR[v.status]");
    expect(REPORT_VERSION_STATUS_LABELS_AR.draft).toBe("مسودة");
  });

  it("T-L2: الحالات الأربع كلها لها تسمية عربية غير فارغة", () => {
    const keys = ["draft", "finalized", "superseded", "stale"] as const;
    expect(Object.keys(REPORT_VERSION_STATUS_LABELS_AR).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      expect(REPORT_VERSION_STATUS_LABELS_AR[k]).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it("T-P1: زر الطباعة معطَّل بلا نسخة تقرير ولا يستدعي window.print", () => {
    // الشرط أصبح أقوى: الطباعة تُفعَّل فقط عند وجود نسخة معتمدة.
    expect(reportSrc).toMatch(
      /onClick=\{onPrint\}[\s\S]{0,120}disabled=\{!active \|\| active\.status !== "finalized"\}/,
    );
    expect(reportSrc).toMatch(
      /const onPrint = \(\) => \{[\s\S]{0,200}if \(!active \|\| active\.status !== "finalized"\) return;/,
    );
  });

  it("T-P2: window.print يُستدعى مرة واحدة فقط في المسار", () => {
    expect(reportSrc.match(/window\.print\(\)/g)?.length).toBe(1);
  });

  it("T-P3: عناصر الإجراءات مستثناة من الطباعة والتقرير معروض", () => {
    expect(reportSrc).toContain('data-testid="report-actions"');
    expect(reportSrc).toMatch(/no-print[\s\S]{0,120}data-testid="report-actions"/);
    expect(read("src/styles.css")).toContain("@media print");
  });

  it("T-N1: لا يوجد عنصر تنقل ميت في شاشة النطاق", () => {
    expect(scopeSrc).not.toContain("data-nav-reserved");
    expect(scopeSrc).not.toContain("useNavigate");
  });

  it("T-N2: توجد وسيلة رجوع واحدة قابلة للوصول إلى مركز الحالة", () => {
    expect(scopeSrc).toMatch(/<Link\s+to="\/cases\/\$caseId"/);
  });
});
