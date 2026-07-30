// Root entry-point fix: "/" is operational, package page moved to /framework-package.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(p: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
}

describe("HIMAM — root entry point", () => {
  const indexSrc = read("src/routes/index.tsx");
  const casesSrc = read("src/routes/cases.index.tsx");
  const packageSrc = read("src/routes/framework-package.tsx");

  it("ENTRY-T01: root route redirects to /cases without a loop", () => {
    expect(indexSrc).toContain('createFileRoute("/")');
    expect(indexSrc).toContain('redirect({ to: "/cases"');
    expect(indexSrc).not.toContain('to: "/"');
    expect(indexSrc).not.toContain("PACKAGE_FILES");
  });

  it("ENTRY-T02: cases dashboard is the start screen with a primary CTA", () => {
    expect(casesSrc).toContain("ابدأ مراجعة خطة تربوية");
    expect(casesSrc).toContain('data-testid="start-review-cta"');
    expect(casesSrc).toContain("إنشاء حالة مراجعة جديدة");
  });

  it("ENTRY-T03: CTA navigates to /cases/new", () => {
    expect(casesSrc).toMatch(/to="\/cases\/new"/);
  });

  it("ENTRY-T04: empty state shows the start CTA", () => {
    expect(casesSrc).toContain('data-testid="cases-empty-state"');
    expect(casesSrc.split('data-testid="cases-empty-state"')[1]).toContain('to="/cases/new"');
  });

  it("ENTRY-T05: secondary non-dominant link to the reference package", () => {
    expect(casesSrc).toContain('data-testid="framework-package-link"');
    expect(casesSrc).toContain("فتح حزمة HIMAM المرجعية");
    expect(casesSrc).toMatch(/to="\/framework-package"/);
  });

  it("ENTRY-T06: package page keeps its route, content and download features", () => {
    expect(packageSrc).toContain('createFileRoute("/framework-package")');
    expect(packageSrc).toContain("PACKAGE_FILES");
    expect(packageSrc).toContain("JSZip");
    expect(packageSrc).toContain("تنزيل الحزمة الكاملة (ZIP)");
    expect(packageSrc).toContain("BOM");
  });

  it("ENTRY-T07: package page links back to the cases dashboard", () => {
    expect(packageSrc).toContain('data-testid="back-to-cases"');
    expect(packageSrc).toMatch(/to="\/cases"/);
  });
});
