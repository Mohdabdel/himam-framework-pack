import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED_EVIDENCE_TYPES,
  CaseExtractionService,
  CaseService,
  DefaultDocumentTextExtractor,
  EvidenceService,
  IdentityIntegrityService,
  IngestionService,
  InMemoryPlanFileStorage,
  MANUAL_TEXT_SOURCE_TYPES,
  SINGLE_ACTIVE_SOURCE_TYPES,
  SOURCE_TYPES_ORDER,
  SOURCE_TYPE_LABELS_AR,
  createInMemoryRepository,
} from "..";
import type { InputSourceType, ReviewCaseRepository } from "..";

function readRouteFile(name: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "src/routes", name), "utf8");
}

function harness() {
  const repo: ReviewCaseRepository = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  const cases = new CaseService(repo, storage);
  const extractor = new DefaultDocumentTextExtractor(
    async () => [],
    async () => "",
  );
  const ingestion = new IngestionService(repo, storage, extractor);
  const evidence = new EvidenceService(repo);
  const identity = new IdentityIntegrityService(repo);
  const caseExtraction = new CaseExtractionService(repo);
  return { repo, storage, cases, ingestion, evidence, identity, caseExtraction };
}

async function seedPlanCase(h: ReturnType<typeof harness>, text = "الطالب أحمد. هدف: يقرأ.") {
  const c = h.cases.createCase({ ageYears: 10, phaseId: "elementary", planType: "IEP" });
  const src = h.cases.registerSource({
    reviewCaseId: c.id,
    type: "plan",
    fileName: "plan.txt",
    mimeType: "text/plain",
  });
  await h.cases.attachPlanFile(src.id, new Blob([text], { type: "text/plain" }));
  await h.ingestion.ingestSource(src.id);
  return { c, src };
}

describe("Package 1B — Operational UI (1B.3)", () => {
  const sourcesRoute = readRouteFile("cases.$caseId.sources.tsx");
  const ingestionRoute = readRouteFile("cases.$caseId.ingestion.tsx");
  const extractionRoute = readRouteFile("cases.$caseId.extraction.tsx");
  const detailRoute = readRouteFile("cases.$caseId.tsx");

  it("PKG1B-UI-T01: eight source types shown in Arabic on sources route", () => {
    expect(SOURCE_TYPES_ORDER).toHaveLength(8);
    for (const t of SOURCE_TYPES_ORDER) {
      expect(SOURCE_TYPE_LABELS_AR[t]).toBeTruthy();
    }
    // The sources route iterates SOURCE_TYPES_ORDER
    expect(sourcesRoute).toContain("SOURCE_TYPES_ORDER");
    expect(sourcesRoute).toContain("SOURCE_TYPE_LABELS_AR");
  });

  it("PKG1B-UI-T02: adding assessment source flags scopeNeedsReconfirmation", async () => {
    const h = harness();
    const { c } = await seedPlanCase(h);
    h.cases.generateScope(c.id);
    h.cases.confirmScope(c.id);
    const assess = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(assess.id, new Blob(["نص"], { type: "text/plain" }));
    const after = h.cases.get(c.id)!;
    expect(after.scopeNeedsReconfirmation).toBe(true);
  });

  it("PKG1B-UI-T03: family_priorities manual text is stored without any localStorage usage", async () => {
    const h = harness();
    const c = h.cases.createCase({ ageYears: 10, phaseId: "elementary", planType: "IEP" });
    const src = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "family_priorities",
      fileName: "أولويات",
      mimeType: null,
    });
    await h.ingestion.ingestManualText(src.id, "الأسرة تعطي أولوية للقراءة.");
    const store = h.repo.load();
    expect(store.textArtifacts.some((a) => a.sourceId === src.id)).toBe(true);
    // Route source must not reference localStorage
    expect(sourcesRoute.includes("localStorage")).toBe(false);
    expect(MANUAL_TEXT_SOURCE_TYPES).toContain<InputSourceType>("family_priorities");
  });

  it("PKG1B-UI-T04: ingestion screen displays chunks and PDF/DOCX/TXT locator labels", () => {
    expect(ingestionRoute).toMatch(/pdf_page/);
    expect(ingestionRoute).toMatch(/docx_paragraph/);
    expect(ingestionRoute).toMatch(/text_lines/);
    expect(ingestionRoute).toMatch(/معاينة النص|Chunk/);
  });

  it("PKG1B-UI-T05: text_unavailable exposes replace/manual/exclude choices", () => {
    expect(ingestionRoute).toContain("text_unavailable");
    expect(ingestionRoute).toContain("استبدال المصدر");
    expect(ingestionRoute).toContain("إضافة دليل يدوي");
    expect(ingestionRoute).toContain("استبعاد مع سبب");
  });

  it("PKG1B-UI-T06: extraction UI offers a deterministic local suggestion run, never a remote AI judgment", () => {
    // The extraction trigger is the offline, judgment-free fallback provider.
    expect(extractionRoute).toContain("LocalFallbackExtractionProvider");
    expect(extractionRoute).toContain("run-local-extraction");
    // It is only enabled once readable text exists, and is blocked read-only.
    expect(extractionRoute).toContain("readOnly || suggestBusy || chunks.length === 0");
    // Remote provider availability is informational only — no trigger.
    expect(extractionRoute).toContain('aiAvailability === "configured"');
  });

  it("PKG1B-UI-T07: manual evidence rejects non-verbatim quote", async () => {
    const h = harness();
    const { src } = await seedPlanCase(h, "This is the plan text.");
    const store = h.repo.load();
    const chunkId = store.textChunks.find((c) => c.sourceId === src.id)!.chunkId;
    expect(() =>
      h.evidence.createManualEvidence({
        sourceId: src.id,
        chunkId,
        exactQuote: "not in the text at all",
        evidenceType: "plan_goal",
      }),
    ).toThrow(/verbatim/);
  });

  it("PKG1B-UI-T08: confirm / edit / reject keep exactQuote stable", async () => {
    const h = harness();
    const { src } = await seedPlanCase(h, "This is the plan text.");
    const store = h.repo.load();
    const chunkId = store.textChunks.find((c) => c.sourceId === src.id)!.chunkId;
    const ev = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId,
      exactQuote: "the plan text",
      evidenceType: "plan_goal",
    });
    const original = ev.exactQuote;
    const edited = h.evidence.editNormalizedText(ev.id, "خطة النص المُطبَّعة");
    expect(edited.exactQuote).toBe(original);
    const confirmed = h.evidence.confirmEvidence(ev.id);
    expect(confirmed.exactQuote).toBe(original);
    // rejection path
    const ev2 = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId,
      exactQuote: "plan",
      evidenceType: "other",
    });
    const rejected = h.evidence.rejectEvidence(ev2.id, "غير مناسب");
    expect(rejected.exactQuote).toBe("plan");
    expect(rejected.status).toBe("rejected");
  });

  it("PKG1B-UI-T09: identity conflict blocks completion until acknowledged", async () => {
    const h = harness();
    const { c, src } = await seedPlanCase(h, "الطالب أحمد يقرأ.");
    const store = h.repo.load();
    const chunkId = store.textChunks.find((c) => c.sourceId === src.id)!.chunkId;
    // Add two conflicting identity markers on the plan
    const e1 = h.evidence.createManualEvidence({
      sourceId: src.id,
      chunkId,
      exactQuote: "أحمد",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(e1.id);
    // Add a second source with a different name
    const s2 = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(s2.id, new Blob(["الطالب سالم."], { type: "text/plain" }));
    await h.ingestion.ingestSource(s2.id);
    const ch2 = h.repo.load().textChunks.find((c) => c.sourceId === s2.id)!.chunkId;
    const e2 = h.evidence.createManualEvidence({
      sourceId: s2.id,
      chunkId: ch2,
      exactQuote: "سالم",
      evidenceType: "identity_marker",
    });
    h.evidence.confirmEvidence(e2.id);
    const status1 = h.caseExtraction.canCompleteExtractionConfirmation(c.id);
    expect(status1.ok).toBe(false);
    if (!status1.ok) expect(status1.reason).toBe("identity_conflict");
    h.identity.acknowledgeIdentityConflict(c.id);
    const status2 = h.caseExtraction.canCompleteExtractionConfirmation(c.id);
    // May still be blocked by scope reconfirmation; but not by identity
    if (!status2.ok) expect(status2.reason).not.toBe("identity_conflict");
  });

  it("PKG1B-UI-T10: scopeNeedsReconfirmation blocks completion until reconfirmed", async () => {
    const h = harness();
    const { c } = await seedPlanCase(h);
    h.cases.generateScope(c.id);
    h.cases.confirmScope(c.id);
    const s2 = h.cases.registerSource({
      reviewCaseId: c.id,
      type: "assessment",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    await h.cases.attachPlanFile(s2.id, new Blob(["نص"], { type: "text/plain" }));
    await h.ingestion.ingestSource(s2.id);
    const blocked = h.caseExtraction.canCompleteExtractionConfirmation(c.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("scope_needs_reconfirmation");
    h.cases.reconfirmScope(c.id);
    const after = h.cases.get(c.id)!;
    expect(after.scopeNeedsReconfirmation).toBe(false);
  });

  it("PKG1B-UI-T11: closed case renders UI screens as read-only", () => {
    // Every route file guards user actions on `readOnly = c.status === 'closed'`
    for (const src of [sourcesRoute, ingestionRoute, extractionRoute]) {
      expect(src).toMatch(/readOnly\s*=\s*c\.status\s*===\s*"closed"/);
      expect(src).toMatch(/disabled=\{readOnly/);
    }
  });

  it("PKG1B-UI-T12: no Package 1C entities appear in operational UI", () => {
    const forbidden = [
      /ReviewFinding/,
      /ReviewEngine/,
      /criterion[_\s-]?score/i,
      /recommendation/i,
      /report[_\s-]?generation/i,
      /Package\s*1C/i,
    ];
    for (const src of [sourcesRoute, ingestionRoute, extractionRoute, detailRoute]) {
      for (const p of forbidden) {
        expect(src).not.toMatch(p);
      }
    }
  });
});
