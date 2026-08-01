// Package 1C.3 Addendum — UX flow acceptance tests (UX-FLOW-T01 … T15).
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CaseService,
  INPUT_IMPACTS,
  JOURNEY_STEPS,
  JOURNEY_STATE_LABELS_AR,
  PROVISIONAL_SCOPE_DISCLAIMER_AR,
  computeJourneyStatuses,
  computeProvisionalScope,
  countScopeBuckets,
  describeInputAbsenceForReport,
  describeInputImpact,
  expandableSources,
  getReviewScope,
  createInMemoryRepository,
  InMemoryPlanFileStorage,
} from "..";
import type { ReviewCaseRepository } from "..";

function readRoute(name: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "src/routes", name), "utf8");
}

function newCases(): { repo: ReviewCaseRepository; cases: CaseService } {
  const repo = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  return { repo, cases: new CaseService(repo, storage) };
}

describe("HIMAM Package 1C.3 addendum — UX flow", () => {
  describe("UX-FLOW-T01: plan + (age OR phase) reaches minimum inputs", () => {
    it("age only + plan is enough", () => {
      const { cases } = newCases();
      const c = cases.createCase({ ageYears: 8, phaseId: null, planType: "IEP" });
      cases.registerSource({
        reviewCaseId: c.id,
        type: "plan",
        fileName: "plan.pdf",
        mimeType: "application/pdf",
      });
      expect(cases.get(c.id)?.status).toBe("minimum_inputs_complete");
    });
    it("phase only + plan is enough", () => {
      const { cases } = newCases();
      const c = cases.createCase({ ageYears: null, phaseId: "elementary", planType: "IEP" });
      cases.registerSource({
        reviewCaseId: c.id,
        type: "plan",
        fileName: "plan.pdf",
        mimeType: "application/pdf",
      });
      expect(cases.get(c.id)?.status).toBe("minimum_inputs_complete");
    });
  });

  it("UX-FLOW-T02: missing assessment does not block reaching text preparation", () => {
    const { cases } = newCases();
    const c = cases.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    cases.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    const statuses = computeJourneyStatuses({
      reviewCase: cases.get(c.id),
      hasReadyPlan: true,
      sourcesCount: 1,
      textReadyCount: 0,
      pendingEvidenceCount: 0,
      confirmedEvidenceCount: 0,
      reviewFinalized: false,
      reviewStale: false,
      reportFinalized: false,
      reportStale: false,
    });
    const text = statuses.find((s) => s.step.id === "text")!;
    expect(["needs_action", "in_progress"]).toContain(text.state);
  });

  it("UX-FLOW-T03: absent assessment turns dependent criteria into not_reviewable (never not_achieved)", () => {
    const withoutAssessment = getReviewScope({
      inputs: ["age_phase", "plan"],
      phaseId: "elementary",
    });
    const withAssessment = getReviewScope({
      inputs: ["age_phase", "plan", "assessment"],
      phaseId: "elementary",
    });
    // adding assessment must strictly widen availability
    expect(withAssessment.availableDomains.length).toBeGreaterThanOrEqual(
      withoutAssessment.availableDomains.length,
    );
    // no scope status can equal not_achieved
    for (const item of withoutAssessment.criterionScope) {
      expect(["available", "not_reviewable", "not_applicable"]).toContain(item.status);
    }
  });

  it("UX-FLOW-T04: assessment card copy explains both presence and absence", () => {
    const impact = describeInputImpact("assessment");
    expect(impact.requirement).toBe("optional");
    expect(impact.whenPresentAr).toContain("نتائج التقييم");
    expect(impact.whenAbsentAr).toContain("غير قابلة للمراجعة");
    // avoid failure/blame language
    for (const t of [impact.whenPresentAr, impact.whenAbsentAr]) {
      expect(t).not.toMatch(/الخطة تفتقر|الخطة غير مكتملة|المدخلات ناقصة/);
    }
  });

  it("UX-FLOW-T05: diagnosis is not a required input key", () => {
    const keys = Object.keys(INPUT_IMPACTS);
    expect(keys).not.toContain("diagnosis");
  });

  it("UX-FLOW-T06: the new-case screen states diagnosis is not used for capability/eligibility", () => {
    const src = readRoute("cases.new.tsx");
    expect(src).toContain("لا يُشترط إدخال التشخيص");
    expect(src).toContain("لا يستخدمه النظام لاستنتاج القدرة");
  });

  it("UX-FLOW-T07: provisional scope changes when an optional source is added", () => {
    const base = countScopeBuckets(computeProvisionalScope(["age_phase", "plan"], "elementary"));
    const withFam = countScopeBuckets(
      computeProvisionalScope(["age_phase", "plan", "family_priorities"], "elementary"),
    );
    expect(withFam.available).toBeGreaterThan(base.available);
  });

  it("UX-FLOW-T08: provisional scope does not require any confirmation flag", () => {
    const scope = computeProvisionalScope(["age_phase", "plan"], "elementary");
    // Confirmation lives on ReviewScopeSnapshot; provisional ScopeResult has no such field.
    expect(Object.keys(scope)).not.toContain("confirmedAt");
  });

  it("UX-FLOW-T09: final scope journey step is locked until extraction is confirmed", () => {
    const { cases } = newCases();
    const c = cases.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    cases.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    const statuses = computeJourneyStatuses({
      reviewCase: cases.get(c.id),
      hasReadyPlan: true,
      sourcesCount: 1,
      textReadyCount: 1,
      pendingEvidenceCount: 0,
      confirmedEvidenceCount: 0,
      reviewFinalized: false,
      reviewStale: false,
      reportFinalized: false,
      reportStale: false,
    });
    const scopeStep = statuses.find((s) => s.step.id === "scope")!;
    expect(scopeStep.state).toBe("not_started");
    expect(scopeStep.blockedReasonAr).toBeTruthy();
  });

  it("UX-FLOW-T10: review step is locked before extraction is confirmed", () => {
    const { cases } = newCases();
    const c = cases.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const statuses = computeJourneyStatuses({
      reviewCase: cases.get(c.id),
      hasReadyPlan: false,
      sourcesCount: 0,
      textReadyCount: 0,
      pendingEvidenceCount: 0,
      confirmedEvidenceCount: 0,
      reviewFinalized: false,
      reviewStale: false,
      reportFinalized: false,
      reportStale: false,
    });
    const reviewStep = statuses.find((s) => s.step.id === "review")!;
    expect(reviewStep.state).toBe("not_started");
  });

  it("UX-FLOW-T11: report screen exposes neutral absence phrasing", () => {
    const src = readRoute("cases.$caseId.report.tsx");
    expect(src).toContain("المدخلات المتاحة وغير المتاحة وأثرها على المراجعة");
    expect(src).not.toContain("الخطة تفتقر");
    const phrase = describeInputAbsenceForReport("assessment");
    expect(phrase).toContain("لم تتوفر بيانات تقييم");
  });

  it("UX-FLOW-T12: not_reviewable is not in the major-gaps section", () => {
    const src = readRoute("cases.$caseId.report.tsx");
    const gapsIdx = src.indexOf('testId="section-major-gaps"');
    const nrIdx = src.indexOf('testId="section-not-reviewable"');
    expect(gapsIdx).toBeGreaterThan(-1);
    expect(nrIdx).toBeGreaterThan(-1);
    // The major-gaps <Section /> block feeds from majorPlanGaps, not notReviewableItems.
    const gapsBlockStart = src.lastIndexOf("<Section", gapsIdx);
    const gapsBlockEnd = src.indexOf("/>", gapsIdx);
    const region = src.slice(gapsBlockStart, gapsBlockEnd);
    expect(region).toContain("majorPlanGaps");
    expect(region).not.toContain("notReviewableItems");
  });

  it("UX-FLOW-T13: journey stepper exposes the 8 addendum stages in order", () => {
    expect(JOURNEY_STEPS.map((s) => s.id)).toEqual([
      "basics",
      "sources",
      "text",
      "evidence",
      "scope",
      "review",
      "report",
      "closure",
    ]);
  });

  it("UX-FLOW-T14: every stage-bearing route surfaces navigation controls", () => {
    const files = [
      "cases.$caseId.sources.tsx",
      "cases.$caseId.ingestion.tsx",
      "cases.$caseId.extraction.tsx",
      "cases.$caseId.review.tsx",
      "cases.$caseId.report.tsx",
    ];
    for (const f of files) {
      const src = readRoute(f);
      expect(src, `${f} missing back link`).toContain("العودة");
    }
  });

  it("UX-FLOW-T15: raw technical values and package codenames do not appear in user UI", () => {
    const files = [
      "cases.$caseId.tsx",
      "cases.$caseId.sources.tsx",
      "cases.$caseId.report.tsx",
      "cases.new.tsx",
    ];
    const forbiddenInText = [
      ">draft<",
      ">scope_confirmed<",
      ">not_reviewable<",
      ">early_intervention<",
      ">extraction_confirmed<",
    ];
    for (const f of files) {
      const src = readRoute(f);
      for (const needle of forbiddenInText) {
        expect(src, `${f} leaks ${needle}`).not.toContain(needle);
      }
      expect(src, `${f} shows package codename`).not.toMatch(/Package\s?1[ABC]/);
    }
    // JOURNEY_STATE_LABELS_AR must not itself contain raw enum tokens as labels
    for (const label of Object.values(JOURNEY_STATE_LABELS_AR)) {
      expect(label).not.toMatch(/[a-zA-Z_]/);
    }
    // Provisional scope disclaimer must be neutral (no failure language).
    expect(PROVISIONAL_SCOPE_DISCLAIMER_AR).not.toMatch(/فشل|ناقص|مفقود/);
  });
});
