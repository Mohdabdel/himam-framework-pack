// UX Correction Gate — CREATE → SOURCES flow, Case Center cleanup,
// and R-GORI knowledge patch.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadCriteriaIndex } from "../knowledge/knowledge-loader";

function read(p: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
}

describe("HIMAM — UX Correction Gate", () => {
  const createSrc = read("src/routes/cases.new.tsx");
  const casesDash = read("src/routes/cases.$caseId.index.tsx");
  const sourcesSrc = read("src/routes/cases.$caseId.sources.tsx");

  it("FLOW-CORR-T01: create screen has a custom plan-upload zone and a hidden native input", () => {
    expect(createSrc).toContain('data-testid="plan-upload-card"');
    expect(createSrc).toContain('data-testid="plan-file-picker"');
    expect(createSrc).toContain('data-testid="plan-file-input"');
    expect(createSrc).toMatch(/className="sr-only"[\s\S]{0,200}data-testid="plan-file-input"/);
  });

  it("FLOW-CORR-T02: create screen redirects to /sources after successful creation", () => {
    expect(createSrc).toContain('to: "/cases/$caseId/sources"');
    expect(createSrc).not.toMatch(/to:\s*"\/cases\/\$caseId"\s*,\s*params/);
  });

  it("FLOW-CORR-T03: create screen keeps privacy note and diagnosis reassurance", () => {
    expect(createSrc).toContain("محليًا داخل المتصفح");
    expect(createSrc).toContain("لا يُشترط إدخال التشخيص");
  });

  it("FLOW-CORR-T04: sources screen persists optional-inputs toggle in sessionStorage", () => {
    expect(sourcesSrc).toContain("sessionStorage");
    expect(sourcesSrc).toContain("himam.sources.optionalOpen.");
  });

  it("FLOW-CORR-T05: sources screen offers continue + return-to-case actions via StageFooter", () => {
    expect(sourcesSrc).toContain("<StageFooter");
    expect(sourcesSrc).toContain("تجهيز الخطة وبدء المراجعة");
    expect(sourcesSrc).toContain("returnToCaseHref");
  });

  it("FLOW-CORR-T06: case-center dashboard removes the 'other sources locked' technical text", () => {
    expect(casesDash).not.toContain("مقفلة للحزم التالية");
  });

  it("FLOW-CORR-T07: case-center dashboard has an actions bar and manage-sources link", () => {
    expect(casesDash).toContain("PrimaryActionsBar");
    expect(casesDash).toContain('data-testid="open-sources-link"');
    expect(casesDash).toContain("العودة إلى قائمة الحالات");
  });

  it("FLOW-CORR-T08: case-center dashboard shows source summary in Arabic labels only", () => {
    expect(casesDash).toContain('data-testid="sources-summary"');
    // No raw `{s.type}` label leaking through.
    expect(casesDash).not.toMatch(/\{s\.type\}\s*—\s*\{s\.fileName\}/);
  });

  it("FLOW-CORR-T09: source register includes R-GORI and Stability-Over-Sessions", () => {
    const reg = read("himam-preprogramming-package-v1.0/04_HIMAM_SOURCE_REGISTER.csv");
    expect(reg).toContain("SRC-GORI-01");
    expect(reg).toContain("R-GORI");
    expect(reg).toContain("SRC-STOB-01");
    expect(reg).toContain("Stability-Over-Sessions");
  });

  it("FLOW-CORR-T10: goal-relationship framework references R-GORI", () => {
    const md = read("himam-preprogramming-package-v1.0/07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md");
    expect(md).toContain("R-GORI");
    expect(md).toContain("SRC-GORI-01");
  });

  it("FLOW-CORR-T11: knowledge loader parses pipe-delimited source_ids for updated criteria", () => {
    const idx = loadCriteriaIndex();
    for (const cid of ["C010", "C030", "C073", "C075"]) {
      const rec = idx.byId.get(cid);
      expect(rec, `criterion ${cid} missing`).toBeTruthy();
      expect(rec!.sourceIds).toEqual(expect.arrayContaining(["SRC-QF-01", "SRC-GORI-01"]));
    }
    const c098 = idx.byId.get("C098")!;
    expect(c098.sourceIds).toEqual(expect.arrayContaining(["SRC-QF-01", "SRC-STOB-01"]));
  });
});
