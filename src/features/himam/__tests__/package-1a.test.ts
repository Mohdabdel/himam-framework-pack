import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as PublicSurface from "..";
import {
  CaseService,
  createInMemoryRepository,
  getReviewScope,
  InMemoryPlanFileStorage,
  planStoragePath,
  loadCriteriaIndex,
  loadInputActivationMatrix,
  loadKnowledgeBundle,
  loadKnowledgeManifest,
  detectPhaseAgeInconsistency,
  PHASE_LABELS_AR,
} from "..";
import { ALL_DOMAINS } from "../knowledge/knowledge-types";

function svc() {
  return new CaseService(createInMemoryRepository(), new InMemoryPlanFileStorage());
}

describe("HIMAM Package 1A", () => {
  let s: CaseService;
  beforeEach(() => {
    s = svc();
  });

  it("PKG1A-T01: case with no age/phase stays draft with no scope [TC01]", () => {
    const c = s.createCase({ ageYears: null, phaseId: null, planType: null });
    expect(c.status).toBe("draft");
    expect(s.latestScope(c.id)).toBeNull();
  });

  it("PKG1A-T02: age without plan stays draft", () => {
    const c = s.createCase({ ageYears: 8, phaseId: "elementary", planType: null });
    expect(c.status).toBe("draft");
  });

  it("PKG1A-T03: plan without age/phase stays draft", () => {
    const c = s.createCase({ ageYears: null, phaseId: null, planType: "IEP" });
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    expect(s.get(c.id)!.status).toBe("draft");
  });

  it("PKG1A-T04: age/phase + plan reach minimum_inputs_complete [TC04]", () => {
    const c = s.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    expect(s.get(c.id)!.status).toBe("minimum_inputs_complete");
  });

  it("PKG1A-T05: missing optional inputs ⇒ dependent domains marked not_reviewable, never failed [TC09]", () => {
    const scope = getReviewScope(["age_phase", "plan"]);
    // D4 (supports/implementation) depends on the supports input;
    // absence must appear as not_reviewable, never as a failure verdict.
    expect(scope.notReviewableDomains).toContain("D4");
    for (const v of Object.values(scope.perDomain)) {
      expect(["available", "not_reviewable", "not_applicable"]).toContain(v);
    }
    expect(JSON.stringify(scope)).not.toMatch(/failed|not_met/);
  });

  it("PKG1A-T06: absent family priorities show as not_reviewable, no fabricated gap [TC23]", () => {
    const scope = getReviewScope(["age_phase", "plan"]);
    expect(scope.notReviewableDomains).toContain("D5");
  });

  it("PKG1A-T07: elementary phase does not force transition requirements", () => {
    const c = s.createCase({
      ageYears: 9,
      phaseId: "elementary",
      planType: "IEP",
    });
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    const { scope } = s.generateScope(c.id);
    const by = new Map(scope.criterionScope.map((x) => [x.criterionId, x]));
    // General age-alignment criterion stays available in elementary.
    expect(by.get("C060")?.status).toBe("available");
    // Transition-only criterion (age>=high_school) is not applicable, not a failure.
    expect(by.get("C062")?.status).toBe("not_applicable");
    expect(by.get("C062")?.reasonCode).toBe("phase_not_applicable");
    // Preschool-only criterion is not applicable in elementary.
    expect(by.get("C063")?.status).toBe("not_applicable");
    // D6 remains available overall — one N/A criterion does not sink the domain.
    expect(scope.availableDomains).toContain("D6");
    // No goal/transition target is fabricated by the scope service.
    expect(JSON.stringify(scope)).not.toMatch(/goal|transition_target/i);
    // The scope service source must not contain a hard-coded numeric age.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/features/himam/scope/scope-service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bage\s*[<>=]+\s*\d+/);
  });

  it("PKG1A-T08: confirming scope creates snapshot and moves to scope_confirmed", () => {
    const c = s.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    s.generateScope(c.id);
    const updated = s.confirmScope(c.id);
    expect(updated.status).toBe("scope_confirmed");
    expect(s.latestScope(c.id)!.confirmedAt).not.toBeNull();
  });

  it("PKG1A-T09: skipping a state is rejected [TC24]", () => {
    const c = s.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    expect(() => s.confirmScope(c.id)).toThrow();
    expect(() => s.closeCase(c.id)).toThrow();
  });

  it("PKG1A-T10: closing writes an audit event and never generates a report [TC25]", () => {
    const c = s.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    s.generateScope(c.id);
    s.confirmScope(c.id);
    const closed = s.closeCase(c.id);
    expect(closed.status).toBe("closed");
    const events = s.auditFor(c.id).map((e) => e.eventType);
    expect(events).toContain("case_closed");
    for (const e of events) {
      expect(e).not.toMatch(/report/);
      expect(e).not.toMatch(/finding/);
      expect(e).not.toMatch(/extraction/);
    }
  });

  it("PKG1A-T11: knowledge loads with ≥55 unique criteria in D0..D8, activation refs valid [TC41]", () => {
    const idx = loadCriteriaIndex();
    const ids = new Set(idx.criteria.map((c) => c.criterionId));
    expect(ids.size).toBe(idx.criteria.length);
    expect(ids.size).toBeGreaterThanOrEqual(55);
    for (const c of idx.criteria) {
      expect(ALL_DOMAINS).toContain(c.domainId);
    }
    const activation = loadInputActivationMatrix(idx);
    for (const row of activation.rows) {
      for (const cid of row.activatesCriteria) {
        expect(idx.byId.has(cid)).toBe(true);
      }
    }
    const manifest = loadKnowledgeManifest();
    expect(manifest.readiness).toBe("CONDITIONAL_GO");
    loadKnowledgeBundle();
  });

  it("PKG1A-T12: architecture forbids Package 1B entities, AI, findings, reports (source scan)", () => {
    const FORBIDDEN = [
      "StudentMasterRecord",
      "LearnerProfile",
      "Student",
      "ExtractionService",
      "RelationshipService",
      "ReportAssemblyService",
      "AIService",
      "SupervisorDecision",
      "ReportVersion",
    ];
    const surface = Object.keys(PublicSurface);
    for (const w of FORBIDDEN) expect(surface).not.toContain(w);

    const roots = [
      path.join(process.cwd(), "src/features/himam"),
      path.join(process.cwd(), "src/routes"),
    ];
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    for (const r of roots) walk(r);
    // Package 1C legitimately introduces the deterministic review engine and
    // findings under src/features/himam/review/. Exclude that subtree from
    // the 1A architectural scan.
    const excludedSubtree = `${path.sep}features${path.sep}himam${path.sep}review${path.sep}`;
    const scoped = files.filter(
      (f) =>
        (f.includes(`${path.sep}features${path.sep}himam${path.sep}`) &&
          !f.includes(excludedSubtree)) ||
        /(^|[\\/])cases[.\\/]/i.test(f) ||
        /[\\/]cases\.[a-z$.]+\.tsx?$/i.test(f),
    );
    for (const f of scoped) {
      const src = fs.readFileSync(f, "utf8");
      for (const w of FORBIDDEN) {
        const re = new RegExp(`\\b(class|interface|type|enum)\\s+${w}\\b`);
        expect(re.test(src), `${w} defined as an entity in ${f}`).toBe(false);
        const svcRe = new RegExp(
          `\\b(new\\s+${w}|${w}\\.(?:instance|singleton|create|resolve))\\b`,
        );
        expect(svcRe.test(src), `${w} instantiated in ${f}`).toBe(false);
      }
    }
  });

  it("PKG1A-T13: plan file is persisted in the storage layer and reconciles on reload", async () => {
    const repo = createInMemoryRepository();
    const storage = new InMemoryPlanFileStorage();
    const s1 = new CaseService(repo, storage);
    const c = s1.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const src = s1.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    const blob = new Blob(["dummy-plan-bytes"], { type: "application/pdf" });
    await s1.attachPlanFile(src.id, blob);

    // Blob stored; storagePath recorded on the source.
    expect(await storage.has(src.id)).toBe(true);
    const stored = await storage.get(src.id);
    expect(stored).not.toBeNull();
    expect(s1.sourcesFor(c.id)[0].storagePath).toBe(planStoragePath(src.id));
    expect(s1.get(c.id)!.status).toBe("minimum_inputs_complete");

    // New service instance over the same repository/storage recovers state.
    const s2 = new CaseService(repo, storage);
    await s2.reconcile();
    expect(s2.sourcesFor(c.id)[0].status).toBe("ready_for_future_ingestion");
    expect(s2.get(c.id)!.status).toBe("minimum_inputs_complete");

    // Simulate the Blob being lost (browser cleared storage): case reverts.
    await storage.delete(src.id);
    await s2.reconcile();
    expect(s2.sourcesFor(c.id)[0].status).toBe("file_missing");
    expect(s2.get(c.id)!.status).toBe("draft");

    // Removing the source cleans up both metadata and any lingering Blob.
    const src2 = s2.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan2.pdf",
      mimeType: "application/pdf",
    });
    await s2.attachPlanFile(src2.id, new Blob(["x"]));
    expect(await storage.has(src2.id)).toBe(true);
    await s2.removeSource(src2.id);
    expect(await storage.has(src2.id)).toBe(false);
    expect(s2.sourcesFor(c.id).find((x) => x.id === src2.id)).toBeUndefined();
  });

  it("PKG1A-T18: dashboard uses Arabic phase labels, never raw phaseId technical values", () => {
    // Central label dictionary covers every phase and has no underscored technical ids.
    for (const [id, label] of Object.entries(PHASE_LABELS_AR)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toBe(id);
      expect(label.length).toBeGreaterThan(0);
    }
    const dashboard = fs.readFileSync(
      path.join(process.cwd(), "src/routes/cases.index.tsx"),
      "utf8",
    );
    const detail = fs.readFileSync(
      path.join(process.cwd(), "src/routes/cases.$caseId.index.tsx"),
      "utf8",
    );
    const RAW = [
      "early_intervention",
      "preschool",
      "elementary",
      "middle",
      "high_school",
      "adult_transition",
      "postsecondary_employment",
    ];
    for (const src of [dashboard, detail]) {
      // Raw technical phase strings must not appear as display literals.
      for (const raw of RAW) {
        expect(src).not.toContain(`"${raw}"`);
        expect(src).not.toContain(`'${raw}'`);
      }
      // No raw `phaseId` fallback rendering (`c.phaseId ??`, `{c.phaseId}`).
      expect(src).not.toMatch(/\{[^}]*\.phaseId\s*\?\?/);
      expect(src).not.toMatch(/\{\s*[a-zA-Z_.]+\.phaseId\s*\}/);
    }
  });

  it("PKG1A-T19: creating a case without referenceCode generates a unique RC-YYYY-XXXX code", () => {
    const a = s.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const b = s.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
    const c = s.createCase({ ageYears: 10, phaseId: "elementary", planType: "IEP" });
    const year = new Date().getFullYear();
    const re = new RegExp(`^RC-${year}-\\d{4}$`);
    for (const x of [a, b, c]) {
      expect(x.referenceCode).toMatch(re);
    }
    expect(new Set([a.referenceCode, b.referenceCode, c.referenceCode]).size).toBe(3);
  });

  it("PKG1A-T20: dashboard hides Package 1A operational chrome", () => {
    const dashboard = fs.readFileSync(
      path.join(process.cwd(), "src/routes/cases.index.tsx"),
      "utf8",
    );
    expect(dashboard).not.toMatch(/Package\s*1A/i);
    expect(dashboard).not.toContain("العودة إلى صفحة حزمة ما قبل البرمجة");
    expect(dashboard).not.toContain("حزمة ما قبل البرمجة");
  });

  it("PKG1A-T21: phase/age inconsistency surfaces a non-blocking hint and does not prevent opening the case", () => {
    // Heuristic detects the mismatch.
    expect(detectPhaseAgeInconsistency(8, "high_school")).toBe(true);
    expect(detectPhaseAgeInconsistency(15, "high_school")).toBe(false);
    // Case can still be created and progressed normally.
    const c = s.createCase({ ageYears: 8, phaseId: "high_school", planType: "IEP" });
    expect(c.status).toBe("draft");
    s.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
    });
    expect(s.get(c.id)!.status).toBe("minimum_inputs_complete");
    // Detail route renders the warning element for inconsistent cases.
    const detail = fs.readFileSync(
      path.join(process.cwd(), "src/routes/cases.$caseId.index.tsx"),
      "utf8",
    );
    expect(detail).toContain("يرجى مراجعة المرحلة المختارة.");
    expect(detail).toContain("detectPhaseAgeInconsistency");
  });
});
