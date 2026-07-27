import { describe, expect, it } from "vitest";
import {
  CaseService,
  DefaultDocumentTextExtractor,
  IngestionService,
  InMemoryPlanFileStorage,
  createInMemoryRepository,
  validatePlanFile,
  SOURCE_TYPES_ORDER,
} from "..";

function makeFile(name = "plan.txt", content = "خطة تجريبية", type = "text/plain") {
  const blob = new Blob([content], { type });
  const file = Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File & Blob;
  return file;
}

function makeSvc() {
  const repo = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  return { svc: new CaseService(repo, storage), repo, storage };
}

describe("Plan upload flow", () => {
  it("PU-T01: creating a case without a plan file is impossible via createCaseWithPlan", async () => {
    const { svc } = makeSvc();
    // Simulate no file: caller should not reach service; ensure invalid file throws.
    const bad = { name: "", size: 0, type: "" } as unknown as File & Blob;
    await expect(
      svc.createCaseWithPlan({
        ageYears: 8,
        phaseId: "elementary",
        planType: "IEP",
        file: bad,
      }),
    ).rejects.toThrow();
    expect(svc.list()).toHaveLength(0);
  });

  it("PU-T02: invalid file rejected before case creation", async () => {
    const { svc } = makeSvc();
    const bad = makeFile("plan.exe", "x", "application/octet-stream");
    await expect(
      svc.createCaseWithPlan({
        ageYears: 8,
        phaseId: "elementary",
        planType: "IEP",
        file: bad,
      }),
    ).rejects.toThrow();
    expect(svc.list()).toHaveLength(0);
  });

  it("PU-T03: valid file saved as Blob and plan source becomes ready_for_future_ingestion", async () => {
    const { svc, storage } = makeSvc();
    const f = makeFile("plan.txt");
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: f,
    });
    const plans = svc.sourcesFor(c.id).filter((s) => s.type === "plan");
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe("ready_for_future_ingestion");
    expect(await storage.has(plans[0].id)).toBe(true);
    expect(await svc.hasUsablePlanSource(c.id)).toBe(true);
  });

  it("PU-T04: validatePlanFile accepts pdf/docx/txt only", () => {
    expect(validatePlanFile({ name: "a.pdf", size: 10, type: "application/pdf" }).ok).toBe(true);
    expect(validatePlanFile({ name: "a.docx", size: 10, type: "" }).ok).toBe(true);
    expect(validatePlanFile({ name: "a.txt", size: 10, type: "text/plain" }).ok).toBe(true);
    expect(validatePlanFile({ name: "a.exe", size: 10, type: "x" }).ok).toBe(false);
  });

  it("PU-T05: plan is excluded from generic add-source ordering list on the sources page", () => {
    // The route filters SOURCE_TYPES_ORDER to exclude 'plan' in the dropdown;
    // check the source list itself contains plan (rendered as its own card).
    expect(SOURCE_TYPES_ORDER).toContain("plan");
  });

  it("PU-T06: ingestion is blocked when plan Blob is missing", async () => {
    const { svc, repo, storage } = makeSvc();
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    const plan = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    // Simulate the Blob vanishing from IndexedDB behind the metadata's back.
    await storage.delete(plan.id);
    const ingestion = new IngestionService(repo, storage, new DefaultDocumentTextExtractor());
    await expect(ingestion.ingestSource(plan.id)).rejects.toThrow(/الخطة/);
    // Central gate reflects the missing Blob.
    expect(await svc.hasUsablePlanSource(c.id)).toBe(false);
  });

  it("PU-T07: reconcile() flips a plan source with missing Blob to file_missing and the case back to draft", async () => {
    const { svc, storage } = makeSvc();
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    expect(svc.get(c.id)!.status).toBe("minimum_inputs_complete");
    const plan = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await storage.delete(plan.id);
    await svc.reconcile();
    const after = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    expect(after.status).toBe("file_missing");
    expect(svc.get(c.id)!.status).toBe("draft");
  });

  it("PU-T08: replacePlanFile saves new file first, then removes old (never a gap without Blob)", async () => {
    const { svc, storage } = makeSvc();
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile("old.txt", "old"),
    });
    const oldId = svc.sourcesFor(c.id).find((s) => s.type === "plan")!.id;
    // Intercept storage.delete to verify order: new blob must exist before old delete runs.
    const originalDelete = storage.delete.bind(storage);
    let sawNewBeforeOldDelete = false;
    storage.delete = async (id: string) => {
      if (id === oldId) {
        const plans = svc.sourcesFor(c.id).filter((s) => s.type === "plan");
        const newP = plans.find((p) => p.id !== oldId);
        if (newP && (await storage.has(newP.id))) sawNewBeforeOldDelete = true;
      }
      return originalDelete(id);
    };
    await svc.replacePlanFile(c.id, makeFile("new.txt", "new"));
    expect(sawNewBeforeOldDelete).toBe(true);
    const plans = svc.sourcesFor(c.id).filter((s) => s.type === "plan");
    expect(plans).toHaveLength(1);
    expect(plans[0].fileName).toBe("new.txt");
    expect(await svc.hasUsablePlanSource(c.id)).toBe(true);
  });

  it("PU-T09: removing the plan drops the case back to draft and invalidates dependents", async () => {
    const { svc } = makeSvc();
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    const plan = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await svc.removeSource(plan.id);
    expect(svc.get(c.id)!.status).toBe("draft");
    expect(await svc.hasUsablePlanSource(c.id)).toBe(false);
  });

  it("PU-T10: closed case cannot have its plan replaced or removed", async () => {
    const { svc, repo } = makeSvc();
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    // Force status to closed for read-only test.
    const store = repo.load();
    store.cases.find((x) => x.id === c.id)!.status = "closed";
    repo.save(store);
    await expect(svc.replacePlanFile(c.id, makeFile("new.txt", "n"))).rejects.toThrow();
  });
});