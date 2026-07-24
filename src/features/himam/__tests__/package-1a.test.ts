import { beforeEach, describe, expect, it } from "vitest";
import * as PublicSurface from "..";
import {
  CaseService,
  createInMemoryRepository,
  getReviewScope,
  loadCriteriaIndex,
  loadInputActivationMatrix,
  loadKnowledgeBundle,
  loadKnowledgeManifest,
} from "..";
import { ALL_DOMAINS } from "../knowledge/knowledge-types";

function svc() {
  return new CaseService(createInMemoryRepository());
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
    expect(scope.perDomain).toBeDefined();
    for (const v of Object.values(scope.perDomain)) {
      expect(["available", "not_reviewable", "not_applicable"]).toContain(v);
    }
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
    expect(["GO", "CONDITIONAL_GO", "NO_GO"]).toContain(manifest.readiness);
    loadKnowledgeBundle();
  });

  it("PKG1A-T12: architecture forbids Package 1B entities, AI, findings, reports", () => {
    const surface = Object.keys(PublicSurface);
    for (const forbidden of [
      "ExtractionService",
      "ReviewEngine",
      "RelationshipService",
      "ReportAssemblyService",
      "AIService",
      "StudentMasterRecord",
      "LearnerProfile",
      "Student",
      "ReviewFinding",
      "SupervisorDecision",
      "ReportVersion",
    ]) {
      expect(surface).not.toContain(forbidden);
    }
  });
});
