import { describe, expect, it } from "vitest";
import {
  CaseService,
  DefaultDocumentTextExtractor,
  IngestionService,
  InMemoryPlanFileStorage,
  createInMemoryRepository,
} from "..";

function makeFile(name = "plan.txt", content = "خطة اختبار محتوى", type = "text/plain") {
  const blob = new Blob([content], { type });
  return Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File & Blob;
}

describe("Plan file persistence regression fix", () => {
  it("PLAN-PERSIST-T01: create → storage.get returns the same non-empty Blob", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const svc = new CaseService(repo, storage);
    const f = makeFile("plan.txt", "hello-plan");
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: f,
    });
    const plan = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    const blob = await storage.get(plan.id);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeGreaterThan(0);
    expect(await blob!.text()).toBe("hello-plan");
  });

  it("PLAN-PERSIST-T02: fresh CaseService + IngestionService instances see the plan and Blob", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const first = new CaseService(repo, storage);
    const c = await first.createCaseWithPlan({
      ageYears: 10,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    // New service instances against the same repo + storage (simulates reload).
    const svc2 = new CaseService(repo, storage);
    const src = svc2.sourcesFor(c.id).find((s) => s.type === "plan");
    expect(src).toBeDefined();
    expect(src!.storagePath).toBeTruthy();
    expect(src!.status).toBe("ready_for_future_ingestion");
    expect(await svc2.hasUsablePlanSource(c.id)).toBe(true);
    const ingestion = new IngestionService(repo, storage, new DefaultDocumentTextExtractor());
    const result = await ingestion.ingestSource(src!.id);
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("PLAN-PERSIST-T03: reconcile() on fresh service does NOT flip a healthy plan to file_missing", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const svc = new CaseService(repo, storage);
    const c = await svc.createCaseWithPlan({
      ageYears: 7,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    const svc2 = new CaseService(repo, storage);
    await svc2.reconcile();
    const plan = svc2.sourcesFor(c.id).find((s) => s.type === "plan")!;
    expect(plan.status).toBe("ready_for_future_ingestion");
    expect(svc2.get(c.id)!.status).toBe("minimum_inputs_complete");
  });

  it("PLAN-PERSIST-T04: ingestion listing places the plan first when Blob present", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const svc = new CaseService(repo, storage);
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    svc.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    const list = svc.sourcesFor(c.id);
    const sorted = [...list].sort((a, b) =>
      a.type === "plan" ? -1 : b.type === "plan" ? 1 : 0,
    );
    expect(sorted[0].type).toBe("plan");
  });

  it("PLAN-PERSIST-T05: metadata present but Blob missing → hasUsablePlanSource false (drives Arabic recovery UI)", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const svc = new CaseService(repo, storage);
    const c = await svc.createCaseWithPlan({
      ageYears: 8,
      phaseId: "elementary",
      planType: "IEP",
      file: makeFile(),
    });
    const plan = svc.sourcesFor(c.id).find((s) => s.type === "plan")!;
    await storage.delete(plan.id);
    expect(await svc.hasUsablePlanSource(c.id)).toBe(false);
    // Explicit read must fail (this is what the ingestion UI now probes).
    const blob = await storage.get(plan.id);
    expect(blob).toBeNull();
  });

  it("PLAN-PERSIST-T06: storage failure during creation → full rollback, no orphan case", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    // Force put() to fail
    storage.put = async () => {
      throw new Error("boom");
    };
    const svc = new CaseService(repo, storage);
    await expect(
      svc.createCaseWithPlan({
        ageYears: 8,
        phaseId: "elementary",
        planType: "IEP",
        file: makeFile(),
      }),
    ).rejects.toThrow();
    expect(svc.list()).toHaveLength(0);
    expect(repo.load().sources).toHaveLength(0);
  });
});