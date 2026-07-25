import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CaseService,
  createInMemoryRepository,
  DefaultDocumentTextExtractor,
  EvidenceService,
  IngestionService,
  InMemoryPlanFileStorage,
  buildChunks,
  guessDocumentKind,
  sha256Hex,
  ALLOWED_EVIDENCE_TYPES,
  isEvidenceTypeAllowed,
} from "..";
import type { ReviewCaseRepository } from "..";
import {
  MockEvidenceExtractionProvider,
  ExtractionRunService,
  IdentityIntegrityService,
  CaseExtractionService,
  prepareMinimalExtractionPayload,
  HIMAM_EXTRACTION_PROMPT_ID,
  HIMAM_EXTRACTION_PROMPT,
} from "../extraction";
import type {
  EvidenceExtractionCandidate,
  ExtractionProviderResult,
} from "../extraction";

function makeHarness() {
  const repo: ReviewCaseRepository = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  const cases = new CaseService(repo, storage);
  const extractor = new DefaultDocumentTextExtractor(
    // pdf extractor is unused in these tests (we use txt)
    async () => [],
    async () => "",
  );
  const ingestion = new IngestionService(repo, storage, extractor);
  const evidence = new EvidenceService(repo);
  const identity = new IdentityIntegrityService(repo);
  const caseExtraction = new CaseExtractionService(repo);
  return { repo, storage, cases, ingestion, evidence, identity, caseExtraction };
}

async function attachTxtPlan(
  h: ReturnType<typeof makeHarness>,
  text = "First paragraph one two three.\n\nSecond paragraph four five six.",
) {
  const c = h.cases.createCase({
    ageYears: 10,
    phaseId: "elementary",
    planType: "IEP",
  });
  const src = h.cases.registerSource({
    reviewCaseId: c.id,
    type: "plan",
    fileName: "plan.txt",
    mimeType: "text/plain",
  });
  const blob = new Blob([text], { type: "text/plain" });
  await h.cases.attachPlanFile(src.id, blob);
  return { caseId: c.id, sourceId: src.id, text };
}

describe("HIMAM Package 1B — Ingestion, Extraction & Confirmation", () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    h = makeHarness();
  });

  // ---- 1B.1 sanity ------------------------------------------------------

  it("PKG1B-T01: guessDocumentKind maps mime/extensions correctly", () => {
    expect(guessDocumentKind("text/plain", "a.txt")).toBe("txt");
    expect(guessDocumentKind(null, "a.docx")).toBe("docx");
    expect(guessDocumentKind("application/pdf", "a.pdf")).toBe("pdf");
    expect(guessDocumentKind(null, "a.jpg")).toBe("unknown");
  });

  it("PKG1B-T02: ingesting a txt source produces artifact + chunks and bumps case to text_ready", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    expect(res.artifact).not.toBeNull();
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.reused).toBe(false);
    expect(res.source.extractionStage).toBe("text_extracted");
    expect(h.cases.get(caseId)!.extractionStage).toBe("text_ready");
  });

  it("PKG1B-T03: an empty file is reported as text_unavailable, never as text", async () => {
    const { sourceId } = await attachTxtPlan(h, "   ");
    const res = await h.ingestion.ingestSource(sourceId);
    expect(res.artifact).toBeNull();
    expect(res.source.extractionStage).toBe("text_unavailable");
  });

  it("PKG1B-T04: no OCR / no image recognition path exists in the codebase", () => {
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
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, `${f} mentions tesseract`).not.toMatch(/tesseract/i);
      expect(src, `${f} performs OCR`).not.toMatch(/\bOCR\b/);
    }
  });

  it("PKG1B-T05: buildChunks yields stable chunk ids for the same input", async () => {
    const pages = [{ pageNumber: 1, text: "One two three.\n\nFour five six." }];
    const a = await buildChunks("s1", "a1", pages, { sourceHash: "h1" });
    const b = await buildChunks("s1", "a2", pages, { sourceHash: "h1" });
    expect(a.map((c) => c.chunkId)).toEqual(b.map((c) => c.chunkId));
  });

  it("PKG1B-T06: sha256Hex returns 64 hex chars", async () => {
    const h1 = await sha256Hex("hello");
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PKG1B-T07: chunk carries a TextLocator", async () => {
    const { sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    for (const c of res.chunks) {
      expect(c.locator).toBeDefined();
      expect(["pdf_page", "docx_paragraph", "text_lines", "manual_text"]).toContain(
        c.locator.kind,
      );
    }
  });

  it("PKG1B-T08: manual evidence requires a verbatim quote from its chunk", async () => {
    const { sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    const chunk = res.chunks[0];
    const ev = h.evidence.createManualEvidence({
      sourceId,
      chunkId: chunk.chunkId,
      exactQuote: chunk.text.slice(0, 10),
      evidenceType: "plan_goal",
    });
    expect(ev.status).toBe("pending");
    expect(ev.extractionMethod).toBe("manual");
  });

  it("PKG1B-T09: quotes not verbatim to the chunk are rejected", async () => {
    const { sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    expect(() =>
      h.evidence.createManualEvidence({
        sourceId,
        chunkId: res.chunks[0].chunkId,
        exactQuote: "SOMETHING NOT IN THE TEXT",
        evidenceType: "plan_goal",
      }),
    ).toThrow(/verbatim/i);
  });

  it("PKG1B-T10: confirm/reject write audit events and set final state", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    const ev1 = h.evidence.createManualEvidence({
      sourceId,
      chunkId: res.chunks[0].chunkId,
      exactQuote: res.chunks[0].text.slice(0, 6),
      evidenceType: "plan_goal",
    });
    const ev2 = h.evidence.createManualEvidence({
      sourceId,
      chunkId: res.chunks[0].chunkId,
      exactQuote: res.chunks[0].text.slice(0, 5),
      evidenceType: "need_statement",
    });
    const c1 = h.evidence.confirmEvidence(ev1.id);
    const c2 = h.evidence.rejectEvidence(ev2.id, "not_relevant");
    expect(c1.status).toBe("confirmed");
    expect(c1.confirmedAt).not.toBeNull();
    expect(c2.status).toBe("rejected");
    const events = h.cases.auditFor(caseId).map((e) => e.eventType);
    expect(events).toContain("evidence_created");
    expect(events).toContain("evidence_confirmed");
    expect(events).toContain("evidence_rejected");
  });

  it("PKG1B-T11: re-ingesting the same blob reuses the same artifact id (content-addressed)", async () => {
    const { sourceId } = await attachTxtPlan(h);
    const res1 = await h.ingestion.ingestSource(sourceId);
    const id1 = res1.artifact!.id;
    const res2 = await h.ingestion.ingestSource(sourceId);
    expect(res2.reused).toBe(true);
    expect(res2.artifact!.id).toBe(id1);
    expect(res2.chunks.map((c) => c.chunkId)).toEqual(res1.chunks.map((c) => c.chunkId));
  });

  it("PKG1B-T12: architecture forbids Package 1C entities and public AI keys", () => {
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
    const FORBIDDEN_ENTITIES = [
      "StudentMasterRecord",
      "LearnerProfile",
      "ReviewFinding",
      "SupervisorDecision",
      "ReportAssemblyService",
      "ReviewEngine",
      "RelationshipService",
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const w of FORBIDDEN_ENTITIES) {
        const decl = new RegExp(`\\b(class|interface|type|enum)\\s+${w}\\b`);
        expect(decl.test(src), `${w} declared in ${f}`).toBe(false);
      }
    }
    // No hard-coded API key style tokens in client-reachable code.
    const clientRoot = path.join(process.cwd(), "src");
    const clientFiles: string[] = [];
    const walk2 = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk2(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          clientFiles.push(full);
        }
      }
    };
    walk2(clientRoot);
    for (const f of clientFiles) {
      if (f.includes(`${path.sep}routes${path.sep}api.`)) continue; // server routes are exempt
      const src = fs.readFileSync(f, "utf8");
      expect(src, `${f} contains an API key literal`).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    }
  });

  it("PKG1B-T13: removing a source cleans artifacts, chunks and evidence", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const res = await h.ingestion.ingestSource(sourceId);
    h.evidence.createManualEvidence({
      sourceId,
      chunkId: res.chunks[0].chunkId,
      exactQuote: res.chunks[0].text.slice(0, 4),
      evidenceType: "plan_goal",
    });
    await h.cases.removeSource(sourceId);
    const store = h.repo.load();
    expect(store.textArtifacts.filter((a) => a.sourceId === sourceId).length).toBe(0);
    expect(store.textChunks.filter((c) => c.sourceId === sourceId).length).toBe(0);
    expect(store.extractedEvidence.filter((e) => e.sourceId === sourceId).length).toBe(0);
    expect(h.cases.sourcesFor(caseId)).toHaveLength(0);
  });

  // ---- 1B.2 AI extraction + confirmation --------------------------------

  function buildMockProvider(
    map: (chunkText: string, chunkId: string) => EvidenceExtractionCandidate[],
  ) {
    return new MockEvidenceExtractionProvider(async (input) => {
      const candidates = input.chunks.flatMap((c) => map(c.text, c.sourceChunkId));
      const result: ExtractionProviderResult = {
        ok: true,
        candidates,
        modelName: "mock-1",
        errorCode: null,
        errorMessage: null,
      };
      return result;
    });
  }

  it("PKG1B-T14: extraction payload minimizes data — no filename, storagePath, ageYears, referenceCode", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    await h.ingestion.ingestSource(sourceId);
    const store = h.repo.load();
    const src = store.sources.find((s) => s.id === sourceId)!;
    const chunks = store.textChunks.filter((c) => c.sourceId === sourceId);
    const payload = prepareMinimalExtractionPayload({
      reviewCaseId: caseId,
      source: src,
      chunks,
    });
    const s = JSON.stringify(payload);
    expect(s).not.toContain(src.fileName);
    expect(s).not.toContain("idb://");
    expect(s).not.toContain("ageYears");
    expect(s).not.toContain("referenceCode");
    expect(s).not.toContain("storagePath");
    expect(payload.promptId).toBe(HIMAM_EXTRACTION_PROMPT_ID);
    expect(payload.allowedEvidenceTypes.length).toBeGreaterThan(0);
  });

  it("PKG1B-T15: a completed AI extraction creates pending evidence bound to the run", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const ing = await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "plan_goal",
        exactQuote: text.slice(0, 8),
        normalizedText: "goal about literacy",
        confidence: "medium",
      },
    ]);
    const runner = new ExtractionRunService(h.repo, provider);
    const { run, createdEvidence } = await runner.start({
      reviewCaseId: caseId,
      sourceId,
    });
    expect(run.status).toBe("completed");
    expect(createdEvidence.length).toBe(ing.chunks.length);
    for (const ev of createdEvidence) {
      expect(ev.status).toBe("pending");
      expect(ev.extractionMethod).toBe("ai");
      expect(ev.extractionRunId).toBe(run.id);
      expect(ev.provenance.promptId).toBe(HIMAM_EXTRACTION_PROMPT_ID);
    }
    expect(h.cases.get(caseId)!.extractionStage).toBe("confirmation_required");
  });

  it("PKG1B-T16: non-verbatim AI candidates trigger a SAFE STOP — no evidence saved", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((_text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "plan_goal",
        exactQuote: "TOTALLY FABRICATED QUOTE",
        normalizedText: "made up",
        confidence: "high",
      },
    ]);
    const runner = new ExtractionRunService(h.repo, provider);
    const { run, createdEvidence } = await runner.start({
      reviewCaseId: caseId,
      sourceId,
    });
    expect(run.status).toBe("safe_stopped");
    expect(run.errorCode).toBe("quote_not_verbatim");
    expect(createdEvidence).toHaveLength(0);
    expect(h.repo.load().extractedEvidence.length).toBe(0);
    const events = h.cases.auditFor(caseId).map((e) => e.eventType);
    expect(events).toContain("extraction_safe_stopped");
  });

  it("PKG1B-T17: an evidenceType not allowed for this source type is safe-stopped", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const ing = await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "family_priority", // plan source cannot yield family_priority
        exactQuote: text.slice(0, 6),
        normalizedText: "x",
        confidence: "low",
      },
    ]);
    void ing;
    const runner = new ExtractionRunService(h.repo, provider);
    const { run } = await runner.start({ reviewCaseId: caseId, sourceId });
    expect(run.status).toBe("safe_stopped");
    expect(run.errorCode).toBe("evidence_type_forbidden");
    expect(isEvidenceTypeAllowed("plan", "family_priority")).toBe(false);
    expect(ALLOWED_EVIDENCE_TYPES.plan).toContain("plan_goal");
  });

  it("PKG1B-T18: sourceHash change between start and validation invalidates the run", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    await h.ingestion.ingestSource(sourceId);
    const provider = new MockEvidenceExtractionProvider(async (input) => {
      // While the provider "thinks", swap the source hash out from under it.
      const store = h.repo.load();
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.sourceHash = "different-hash";
      h.repo.save(store);
      return {
        ok: true,
        modelName: "mock-1",
        errorCode: null,
        errorMessage: null,
        candidates: input.chunks.map((c) => ({
          sourceChunkId: c.sourceChunkId,
          evidenceType: "plan_goal" as const,
          exactQuote: c.text.slice(0, 6),
          normalizedText: "x",
          confidence: "medium" as const,
        })),
      };
    });
    const runner = new ExtractionRunService(h.repo, provider);
    const { run } = await runner.start({ reviewCaseId: caseId, sourceId });
    expect(run.status).toBe("safe_stopped");
    expect(run.errorCode).toBe("source_hash_changed");
  });

  it("PKG1B-T19: confirming AI evidence keeps its verbatim quote and locator", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const ing = await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "plan_goal",
        exactQuote: text.slice(0, 7),
        normalizedText: "literacy",
        confidence: "medium",
      },
    ]);
    const runner = new ExtractionRunService(h.repo, provider);
    const { createdEvidence } = await runner.start({
      reviewCaseId: caseId,
      sourceId,
    });
    const ev = createdEvidence[0];
    const chunk = ing.chunks.find((c) => c.chunkId === ev.sourceChunkId)!;
    expect(chunk.text.includes(ev.exactQuote)).toBe(true);
    const c = h.evidence.confirmEvidence(ev.id);
    expect(c.status).toBe("confirmed");
    expect(c.locator).toEqual(chunk.locator);
  });

  it("PKG1B-T20: pending evidence blocks extraction confirmation", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "plan_goal",
        exactQuote: text.slice(0, 6),
        normalizedText: "x",
        confidence: "medium",
      },
    ]);
    const runner = new ExtractionRunService(h.repo, provider);
    await runner.start({ reviewCaseId: caseId, sourceId });
    const gate = h.caseExtraction.canCompleteExtractionConfirmation(caseId);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("pending_evidence");
  });

  it("PKG1B-T21: conflicting identity_marker evidence blocks confirmation until acknowledged", async () => {
    const { caseId, sourceId } = await attachTxtPlan(
      h,
      "Name Alpha here.\n\nName Beta elsewhere.",
    );
    const ing = await h.ingestion.ingestSource(sourceId);
    // Two identity markers with different normalized text.
    const ev1 = h.evidence.createManualEvidence({
      sourceId,
      chunkId: ing.chunks[0].chunkId,
      exactQuote: ing.chunks[0].text.slice(0, 4),
      evidenceType: "identity_marker",
      normalizedText: "student-alpha",
    });
    const ev2 = h.evidence.createManualEvidence({
      sourceId,
      chunkId: ing.chunks[1].chunkId,
      exactQuote: ing.chunks[1].text.slice(0, 4),
      evidenceType: "identity_marker",
      normalizedText: "student-beta",
    });
    h.evidence.confirmEvidence(ev1.id);
    h.evidence.confirmEvidence(ev2.id);
    const gate = h.caseExtraction.canCompleteExtractionConfirmation(caseId);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("identity_conflict");
    h.identity.acknowledgeIdentityConflict(caseId);
    const gate2 = h.caseExtraction.canCompleteExtractionConfirmation(caseId);
    expect(gate2.ok).toBe(true);
  });

  it("PKG1B-T22: successful confirmation moves case to extraction_confirmed", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h);
    const ing = await h.ingestion.ingestSource(sourceId);
    const provider = buildMockProvider((text, chunkId) => [
      {
        sourceChunkId: chunkId,
        evidenceType: "plan_goal",
        exactQuote: text.slice(0, 6),
        normalizedText: "goal",
        confidence: "medium",
      },
    ]);
    const runner = new ExtractionRunService(h.repo, provider);
    const { createdEvidence } = await runner.start({
      reviewCaseId: caseId,
      sourceId,
    });
    for (const ev of createdEvidence) h.evidence.confirmEvidence(ev.id);
    void ing;
    const done = h.caseExtraction.completeExtractionConfirmation(caseId);
    expect(done.ok).toBe(true);
    expect(h.cases.get(caseId)!.extractionStage).toBe("extraction_confirmed");
    const events = h.cases.auditFor(caseId).map((e) => e.eventType);
    expect(events).toContain("extraction_confirmation_completed");
  });

  it("PKG1B-T23: adding a source after a confirmed scope flags reconfirmation", async () => {
    const c = h.cases.createCase({
      ageYears: 10,
      phaseId: "elementary",
      planType: "IEP",
    });
    h.cases.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.txt",
      mimeType: "text/plain",
    });
    h.cases.generateScope(c.id);
    h.cases.confirmScope(c.id);
    h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "assess.txt",
      mimeType: "text/plain",
    });
    expect(h.cases.get(c.id)!.scopeNeedsReconfirmation).toBe(true);
    const events = h.cases.auditFor(c.id).map((e) => e.eventType);
    expect(events).toContain("scope_reconfirmation_required");
  });

  it("PKG1B-T24: unresolved text_unavailable plan blocks confirmation", async () => {
    const { caseId, sourceId } = await attachTxtPlan(h, "   ");
    await h.ingestion.ingestSource(sourceId);
    const gate = h.caseExtraction.canCompleteExtractionConfirmation(caseId);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect([
        "unresolved_text_unavailable_source",
        "plan_text_and_evidence_missing",
      ]).toContain(gate.reason);
    }
  });

  it("PKG1B-T25: prompt contract is frozen and forbids inventing criteria/goals in its own text", () => {
    expect(HIMAM_EXTRACTION_PROMPT.promptId).toBe(HIMAM_EXTRACTION_PROMPT_ID);
    expect(HIMAM_EXTRACTION_PROMPT.version).toBe(1);
    const s = HIMAM_EXTRACTION_PROMPT.systemInstruction;
    expect(s).toMatch(/verbatim/i);
    expect(s).toMatch(/MUST NOT invent/i);
    expect(s).toMatch(/criter/i);
    expect(s).toMatch(/goals/i);
    // Prompt is stable across process runs.
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(80);
  });
});