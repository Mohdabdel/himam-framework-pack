// UX round — WorkflowShell, journey navigation and single-primary-action rules.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

const STAGE_ROUTES = [
  "src/routes/cases.$caseId.sources.tsx",
  "src/routes/cases.$caseId.ingestion.tsx",
  "src/routes/cases.$caseId.extraction.tsx",
  "src/routes/cases.$caseId.scope.tsx",
  "src/routes/cases.$caseId.review.tsx",
  "src/routes/cases.$caseId.report.tsx",
  "src/routes/cases.$caseId.index.tsx",
];

describe("UX round — unified workflow shell", () => {
  it("UXW-T01: every case screen renders inside WorkflowShell", () => {
    for (const r of STAGE_ROUTES) {
      const s = read(r);
      expect(s, r).toContain("<WorkflowShell");
      expect(s, r).toContain("</WorkflowShell>");
    }
  });

  it("UXW-T02: shell exposes case identity, save state and back-to-cases link", () => {
    const s = read("src/features/himam/ui/WorkflowShell.tsx");
    expect(s).toContain('data-testid="workflow-case-code"');
    expect(s).toContain('data-testid="workflow-save-state"');
    expect(s).toContain('data-testid="workflow-back-to-cases"');
  });

  it("UXW-T03: shell renders an 8-step indicator with desktop + mobile variants", () => {
    const s = read("src/features/himam/ui/WorkflowShell.tsx");
    expect(s).toContain('data-testid="workflow-steps-desktop"');
    expect(s).toContain('data-testid="workflow-steps-mobile"');
    expect(s).toContain("من 8");
  });

  it("UXW-T04: locked steps show an Arabic reason plus a link to the required step", () => {
    const s = read("src/features/himam/ui/WorkflowShell.tsx");
    expect(s).toContain('data-testid="workflow-step-locked"');
    expect(s).toContain("هذه الخطوة غير متاحة بعد");
    expect(s).toContain('data-testid="workflow-goto-required-step"');
  });

  it("UXW-T05: cases list shows a single start CTA and one continue button per case", () => {
    const s = read("src/routes/cases.index.tsx");
    expect(s.match(/start-review-cta/g)?.length).toBe(1);
    expect(s).toContain("متابعة");
    expect(s).toContain("الخطوة الحالية:");
    expect(s).not.toContain("المعرّف المختصر");
  });

  it("UXW-T06: case center folds secondary routes and the dense stepper", () => {
    const s = read("src/routes/cases.$caseId.index.tsx");
    expect(s).toContain("خيارات أخرى");
    expect(s).toContain("تفاصيل رحلة المراجعة");
  });

  it("UXW-T07: sources screen keeps one primary action in the footer", () => {
    const s = read("src/routes/cases.$caseId.sources.tsx");
    expect(s).not.toMatch(
      /sources-primary-cta"\s*\n\s*className="mt-3 inline-flex rounded-md bg-primary/,
    );
    expect(s).toContain("تجهيز الخطة وبدء المراجعة");
  });

  it("UXW-T08: review screen is task-led and filters cannot replace the task counts", () => {
    const s = read("src/routes/cases.$caseId.review.tsx");
    expect(s).toContain('data-testid="review-task-center"');
    expect(s).toContain('testId="review-view-professional"');
    expect(s).toContain('testId="review-view-system"');
    expect(s).toContain("const taskFindings = findings.filter");
    expect(s).toContain("لا يمكن للفلاتر المتقدمة تغيير أعداد المهام");
    expect(s).not.toContain('data-testid="accept-all-critical"');
  });

  it("UXW-T09: a goal decision exposes the exact plan quote and its provenance", () => {
    const s = read("src/routes/cases.$caseId.review.tsx");
    expect(s).toContain('data-testid="goal-context-trigger"');
    expect(s).toContain('data-testid="goal-context-tooltip"');
    expect(s).toContain('data-testid="goal-context-expanded"');
    expect(s).toContain('data-testid="goal-context-in-decision"');
    expect(s).toContain("locatorLabelAr(goalEvidence.locator)");
    expect(s).toContain("تعذّر ربط رمز الهدف بالنص الأصلي المؤكد");
  });

  it("UXW-T10: report navigation remains locked until the review version is sealed", () => {
    const s = read("src/routes/cases.$caseId.review.tsx");
    expect(s).toContain("version?.completedAt && !drift.drifted");
    expect(s).toContain("continueDisabled={!version?.completedAt || drift.drifted}");
  });
});
