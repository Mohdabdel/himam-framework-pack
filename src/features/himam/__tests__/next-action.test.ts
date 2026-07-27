import { describe, expect, it, beforeEach } from "vitest";
import {
  CaseService,
  createInMemoryRepository,
  InMemoryPlanFileStorage,
  resolveCaseNextAction,
  caseGateReasonAr,
} from "@/features/himam";

function makeSvc() {
  const repo = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  return { repo, storage, svc: new CaseService(repo, storage) };
}

describe("resolveCaseNextAction", () => {
  let ctx: ReturnType<typeof makeSvc>;
  beforeEach(() => {
    ctx = makeSvc();
  });

  it("returns case_not_found for unknown ids", () => {
    const na = resolveCaseNextAction("does-not-exist", ctx.repo);
    expect(na.kind).toBe("case_not_found");
    expect(na.ctaEnabled).toBe(false);
  });

  it("open_basics when age & phase both null", () => {
    const c = ctx.svc.createCase({ ageYears: null, phaseId: null, planType: null });
    const na = resolveCaseNextAction(c.id, ctx.repo);
    expect(na.kind).toBe("open_basics");
    expect(na.stepId).toBe("basics");
    expect(na.blockedReasonAr).toBeTruthy();
  });

  it("attach_plan when basics complete but no plan source", () => {
    const c = ctx.svc.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const na = resolveCaseNextAction(c.id, ctx.repo);
    expect(na.kind).toBe("attach_plan");
    expect(na.stepId).toBe("sources");
    expect(na.ctaLabelAr).toContain("ملف الخطة");
  });

  it("prepare_text after plan is attached", async () => {
    const file = new File(["hi"], "p.txt", { type: "text/plain" });
    const c = await ctx.svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: file as unknown as { name: string; size: number; type: string } & Blob,
    });
    const na = resolveCaseNextAction(c.id, ctx.repo);
    expect(na.kind).toBe("prepare_text");
    expect(na.stepId).toBe("text");
    expect(na.ctaHref).toBe("/cases/$caseId/ingestion");
  });

  it("case_closed short-circuits everything", () => {
    const c = ctx.svc.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const store = ctx.repo.load();
    const raw = store.cases.find((x) => x.id === c.id)!;
    raw.status = "closed";
    ctx.repo.save(store);
    const na = resolveCaseNextAction(c.id, ctx.repo);
    expect(na.kind).toBe("case_closed");
    expect(na.stateSummaryAr).toContain("مغلقة");
  });

  it("caseGateReasonAr translates known reasons to Arabic and passes unknown through", () => {
    expect(caseGateReasonAr("scope_not_confirmed")).toContain("نطاق");
    expect(caseGateReasonAr("review_stale")).toContain("قديمة");
    expect(caseGateReasonAr("xyz_unknown_code")).toBe("xyz_unknown_code");
  });
});
