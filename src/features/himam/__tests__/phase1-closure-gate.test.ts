// HIMAM Phase 1 Closure Gate — UX/a11y/mobile hardening across every stage screen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(p: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
}

const panel = read("src/features/himam/ui/ResponsivePanel.tsx");
const collapsible = read("src/features/himam/ui/CollapsibleSection.tsx");
const sources = read("src/routes/cases.$caseId.sources.tsx");
const ingestion = read("src/routes/cases.$caseId.ingestion.tsx");
const extraction = read("src/routes/cases.$caseId.extraction.tsx");
const review = read("src/routes/cases.$caseId.review.tsx");
const report = read("src/routes/cases.$caseId.report.tsx");
const dashboard = read("src/routes/cases.$caseId.index.tsx");
const labels = read("src/features/himam/review/review-labels.ts");

describe("HIMAM — Phase 1 Closure Gate", () => {
  it("P1-T01: shared panel is a drawer on desktop and a bottom sheet on mobile", () => {
    expect(panel).toContain("useIsMobile");
    expect(panel).toContain('data-panel-mode={isMobile ? "bottom-sheet" : "drawer"}');
    expect(panel).toContain("max-h-[85vh]");
  });

  it("P1-T02: shared panel is an accessible dialog with Escape support", () => {
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-modal="true"');
    expect(panel).toContain("aria-labelledby");
    expect(panel).toContain('e.key === "Escape"');
  });

  it("P1-T03: shared panel warns before discarding unsaved input and returns focus", () => {
    expect(panel).toContain('data-testid="panel-dirty-warning"');
    expect(panel).toContain("لديك تغييرات غير محفوظة");
    expect(panel).toContain("returnFocusTo");
    expect(panel).toContain("target.focus()");
  });

  it("P1-T04: collapsible sections are accessible and always expanded in print", () => {
    expect(collapsible).toContain("aria-expanded");
    expect(collapsible).toContain("aria-controls");
    expect(collapsible).toContain("print:block");
  });

  it("P1-T05: sources screen manages every source through the shared panel", () => {
    expect(sources).toContain("<ResponsivePanel");
    expect(sources).toContain("panelDirty");
    expect(sources).toContain('data-testid="panel-save-source"');
    expect(sources).toContain("returnFocusTo={activeOpenerRef}");
  });

  it("P1-T06: sources counters stack on mobile", () => {
    expect(sources).toContain('data-testid="scope-counters-grid"');
    expect(sources).toContain("grid-cols-1 gap-3 text-sm sm:grid-cols-3");
  });

  it("P1-T07: case center exposes always-available primary actions with Arabic gate reasons", () => {
    expect(dashboard).toContain('data-testid="case-top-actions"');
    expect(dashboard).toContain('data-testid="action-manage-sources"');
    expect(dashboard).toContain("reviewGate.reasonAr");
    expect(dashboard).toContain("reportGate.reasonAr");
  });

  it("P1-T08: case center folds secondary basics into a collapsible section", () => {
    expect(dashboard).toContain("<CollapsibleSection");
    expect(dashboard).toContain('data-testid="basics-summary"');
  });

  it("P1-T09: ingestion screen summarises progress and folds settled sources", () => {
    expect(ingestion).toContain('data-testid="ingestion-counters"');
    expect(ingestion).toContain('data-testid="ingestion-settled-section"');
    expect(ingestion).toContain('data-testid="ingestion-details-toggle"');
    expect(ingestion).toContain("{detailsOpen && (");
  });

  it("P1-T10: ingestion text preview opens in the shared panel", () => {
    expect(ingestion).toContain("<ResponsivePanel");
    expect(ingestion).toContain("preview-panel-");
  });

  it("P1-T11: extraction screen no longer uses window.prompt", () => {
    expect(extraction).not.toContain("window.prompt");
    expect(extraction).toContain('data-testid="evidence-panel-text"');
    expect(extraction).toContain('data-testid="evidence-panel-save"');
  });

  it("P1-T12: extraction screen drops locked-feature wording and offers a continuation", () => {
    expect(extraction).not.toContain("مقفلة في هذا الإصدار");
    expect(extraction).toContain("<StageFooter");
    expect(extraction).toContain("الانتقال إلى المراجعة المهنية");
  });

  it("P1-T13: review findings show pending-decision state on the compact card", () => {
    expect(review).toContain('data-testid="finding-awaiting-decision"');
    expect(review).toContain('data-testid="finding-uncertainty"');
  });

  it("P1-T14: review decisions happen inside the shared panel with a dirty guard", () => {
    expect(review).toContain("<ResponsivePanel");
    expect(review).toContain("dirty={rationale.trim().length > 0}");
    expect(review).toContain("data-testid={`finding-decision-${d}`}");
  });

  it("P1-T15: review filters expose result counts and quick pending filter", () => {
    expect(review).toContain('data-testid="review-filter-count"');
    expect(review).toContain('data-testid="review-filter-pending"');
    expect(review).toContain('data-testid="review-filter-reset"');
  });

  it("P1-T16: blocked review/report screens link to the step that unblocks them", () => {
    expect(review).toContain('data-testid="review-gate-goto-step"');
    expect(report).toContain('data-testid="report-gate-goto-step"');
    expect(labels).toContain("GATE_REASON_TARGET_STEP_AR");
  });

  it("P1-T17: every report gate reason has an Arabic sentence", () => {
    for (const reason of [
      "no_review_version",
      "review_not_completed",
      "review_stale",
      "scope_needs_reconfirmation",
      "extraction_not_confirmed",
      "identity_conflict_unresolved",
      "critical_findings_pending",
      "evidence_drift_detected",
      "case_closed_read_only",
    ]) {
      expect(labels).toContain(`${reason}:`);
    }
  });

  it("P1-T18: report has a section index anchored to printable sections", () => {
    expect(report).toContain('data-testid="report-toc"');
    expect(report).toContain('id="report-metadata"');
    expect(report).toContain('id="section-governance"');
    expect(report).toContain("<section id={testId}");
  });

  it("P1-T19: report input-impact detail is collapsible yet printed in full", () => {
    expect(report).toContain("<CollapsibleSection");
    expect(report).toContain('data-testid="report-inputs-impact"');
    expect(report).toContain("تُطبع كاملة");
  });

  it("P1-T20: no screen reintroduces AI-live, OCR, or quality-score wording", () => {
    for (const src of [sources, ingestion, extraction, review, report, dashboard]) {
      expect(src).not.toContain("OCR");
      expect(src).not.toContain("درجة الجودة");
      expect(src).not.toContain("نسبة الجودة");
    }
  });
});
