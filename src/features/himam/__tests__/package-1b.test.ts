import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CaseService,
  DefaultDocumentTextExtractor,
  EvidenceService,
  IngestionService,
  InMemoryPlanFileStorage,
  buildChunks,
  createInMemoryRepository,
  sha256Hex,
  textArtifactPath,
} from "..";
import type { PdfPageExtractor, DocxTextExtractor } from "..";
import { validatePlanFile } from "../sources/source-service";

function harness() {
  const repo = createInMemoryRepository();
  const storage = new InMemoryPlanFileStorage();
  const caseSvc = new CaseService(repo, storage);
  const evidence = new EvidenceService(repo);
  const makeIngest = (pdf?: PdfPageExtractor, docx?: DocxTextExtractor) =>
    new IngestionService(
      repo,
      storage,
      new DefaultDocumentTextExtractor(
        pdf ?? (async () => []),
        docx ?? (async () => ""),
      ),
    );
  return { repo, storage, caseSvc, evidence, makeIngest };
}

async function setupPlanCase(
  h: ReturnType<typeof harness>,
  file: { name: string; type: string; content: string },
) {
  const c = h.caseSvc.createCase({
    ageYears: 10,
    phaseId: "elementary",
    planType: "IEP",
  });
  const src = h.caseSvc.registerSource({
    reviewCaseId: c.id,
    type: "plan",
    fileName: file.name,
    mimeType: file.type,
  });
  const blob = new Blob([file.content], { type: file.type });
  await h.caseSvc.attachPlanFile(src.id, blob);
  return { c, src };
}

describe("HIMAM Package 1B.1 — Ingestion + Manual Evidence", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("PKG1B-T01: TXT ingestion produces content-addressed chunks", async () => {
    const { src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "الفقرة الأولى.\n\nالفقرة الثانية.\n\nالفقرة الثالثة.",
    });
    const ingest = h.makeIngest();
    const res = await ingest.ingestSource(src.id);
    expect(res.artifact).not.toBeNull();
    expect(res.chunks.length).toBe(3);
    expect(res.chunks.map((c) => c.text)).toEqual([
      "الفقرة الأولى.",
      "الفقرة الثانية.",
      "الفقرة الثالثة.",
    ]);
    for (const c of res.chunks) {
      expect(c.chunkId).toMatch(/^[0-9a-f]{16}$/);
      expect(c.sourceId).toBe(src.id);
    }
    expect(res.chunks[0].charOffsetStart).toBe(0);
    expect(h.caseSvc.sourcesFor(res.source.reviewCaseId)[0].extractionStage).toBe(
      "text_extracted",
    );
  });

  it("PKG1B-T02: DOCX ingestion produces chunks via the injected extractor", async () => {
    const { src } = await setupPlanCase(h, {
      name: "plan.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: "dummy-docx-bytes",
    });
    const docx: DocxTextExtractor = async () =>
      "الهدف الأول: القراءة.\n\nالهدف الثاني: الحساب.";
    const ingest = h.makeIngest(undefined, docx);
    const res = await ingest.ingestSource(src.id);
    expect(res.chunks.length).toBe(2);
    expect(res.chunks[1].text).toBe("الهدف الثاني: الحساب.");
    expect(res.chunks[0].pageNumber).toBeNull();
  });

  it("PKG1B-T03: PDF ingestion carries pageNumber on each chunk", async () => {
    const { src } = await setupPlanCase(h, {
      name: "plan.pdf",
      type: "application/pdf",
      content: "dummy-pdf-bytes",
    });
    const pdf: PdfPageExtractor = async () => [
      { pageNumber: 1, text: "الغلاف والملخص." },
      { pageNumber: 2, text: "الأهداف السنوية.\n\nمعايير القياس." },
    ];
    const ingest = h.makeIngest(pdf);
    const res = await ingest.ingestSource(src.id);
    expect(res.chunks.length).toBe(3);
    expect(res.chunks[0].pageNumber).toBe(1);
    expect(res.chunks[1].pageNumber).toBe(2);
    expect(res.chunks[2].pageNumber).toBe(2);
  });

  it("PKG1B-T04: scanned/empty PDF produces text_unavailable and no chunks (no OCR)", async () => {
    const { src } = await setupPlanCase(h, {
      name: "scan.pdf",
      type: "application/pdf",
      content: "scanned-image-only",
    });
    const pdf: PdfPageExtractor = async () => [
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "   " },
    ];
    const ingest = h.makeIngest(pdf);
    const res = await ingest.ingestSource(src.id);
    expect(res.artifact).toBeNull();
    expect(res.chunks).toEqual([]);
    expect(h.caseSvc.sourcesFor(res.source.reviewCaseId)[0].extractionStage).toBe(
      "text_unavailable",
    );
    const events = h.caseSvc.auditFor(res.source.reviewCaseId).map((e) => e.eventType);
    expect(events).toContain("source_ingest_failed");
    const roots = ["src/features/himam", "src/routes"];
    for (const r of roots) {
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === "__tests__" || e.name === "node_modules") continue;
            walk(full);
          } else if (/\.(ts|tsx)$/.test(e.name)) {
            const src = fs.readFileSync(full, "utf8");
            expect(src, `${full} mentions OCR`).not.toMatch(/\bOCR\b/);
            expect(src, `${full} mentions tesseract`).not.toMatch(/tesseract/i);
          }
        }
      };
      walk(path.join(process.cwd(), r));
    }
  });

  it("PKG1B-T05: oversized file is rejected as unreadable and never ingested", async () => {
    const oversized = validatePlanFile({
      name: "huge.pdf",
      size: 26 * 1024 * 1024,
      type: "application/pdf",
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.status).toBe("unreadable");
    const c = h.caseSvc.createCase({ ageYears: 8, phaseId: "elementary", planType: "IEP" });
    const src = h.caseSvc.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "huge.pdf",
      mimeType: "application/pdf",
    });
    const ingest = h.makeIngest();
    await expect(ingest.ingestSource(src.id)).rejects.toThrow(/attached file/);
  });

  it("PKG1B-T06: chunk ids are deterministic across re-runs", async () => {
    const chunksA = await buildChunks("src-1", "art-1", [
      { pageNumber: 1, text: "أ.\n\nب." },
    ]);
    const chunksB = await buildChunks("src-1", "art-1", [
      { pageNumber: 1, text: "أ.\n\nب." },
    ]);
    expect(chunksA.map((c) => c.chunkId)).toEqual(chunksB.map((c) => c.chunkId));
    const chunksC = await buildChunks("src-2", "art-1", [
      { pageNumber: 1, text: "أ.\n\nب." },
    ]);
    expect(chunksC[0].chunkId).not.toBe(chunksA[0].chunkId);
    const hash = await sha256Hex("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PKG1B-T07: extractionStage advances only after a successful ingest", async () => {
    const c = h.caseSvc.createCase({ ageYears: 9, phaseId: "elementary", planType: "IEP" });
    const src = h.caseSvc.registerSource({
      reviewCaseId: c.id,
      type: "plan",
      fileName: "plan.txt",
      mimeType: "text/plain",
    });
    expect(h.caseSvc.sourcesFor(c.id)[0].extractionStage).toBe("not_started");
    await h.caseSvc.attachPlanFile(src.id, new Blob(["hello world."], { type: "text/plain" }));
    expect(h.caseSvc.sourcesFor(c.id)[0].extractionStage).toBe("not_started");
    const ingest = h.makeIngest();
    await ingest.ingestSource(src.id);
    expect(h.caseSvc.sourcesFor(c.id)[0].extractionStage).toBe("text_extracted");
  });

  it("PKG1B-T08: manual evidence with a verbatim quote is accepted", async () => {
    const { c, src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "الهدف: يقرأ الطالب 60 كلمة في الدقيقة.\n\nالمعيار: 3 محاولات متتالية.",
    });
    const ingest = h.makeIngest();
    const { chunks } = await ingest.ingestSource(src.id);
    const ev = h.evidence.addManual({
      sourceId: src.id,
      chunkId: chunks[0].chunkId,
      quote: "60 كلمة في الدقيقة",
      criterionId: "C001",
      domainId: "D1",
    });
    expect(ev.status).toBe("proposed");
    expect(ev.origin).toBe("manual");
    expect(ev.reviewCaseId).toBe(c.id);
  });

  it("PKG1B-T09: non-verbatim quotes are rejected (anti-hallucination gate)", async () => {
    const { src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "الهدف: القراءة الطلاقية.",
    });
    const ingest = h.makeIngest();
    const { chunks } = await ingest.ingestSource(src.id);
    expect(() =>
      h.evidence.addManual({
        sourceId: src.id,
        chunkId: chunks[0].chunkId,
        quote: "القراءة بطلاقة",
        criterionId: "C001",
        domainId: "D1",
      }),
    ).toThrow(/verbatim/i);
  });

  it("PKG1B-T10: evidence lifecycle is proposed → confirmed/rejected and audited", async () => {
    const { c, src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "قصير جدًا.",
    });
    const ingest = h.makeIngest();
    const { chunks } = await ingest.ingestSource(src.id);
    const ev = h.evidence.addManual({
      sourceId: src.id,
      chunkId: chunks[0].chunkId,
      quote: "قصير جدًا.",
      criterionId: "C002",
      domainId: "D1",
    });
    const confirmed = h.evidence.decide(ev.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.decidedAt).not.toBeNull();
    expect(() => h.evidence.decide(ev.id, "rejected")).toThrow();

    const ev2 = h.evidence.addManual({
      sourceId: src.id,
      chunkId: chunks[0].chunkId,
      quote: "قصير",
      criterionId: "C003",
      domainId: "D1",
    });
    h.evidence.decide(ev2.id, "rejected");

    const events = h.caseSvc.auditFor(c.id).map((e) => e.eventType);
    expect(events).toContain("evidence_proposed");
    expect(events).toContain("evidence_confirmed");
    expect(events).toContain("evidence_rejected");
  });

  it("PKG1B-T11: text artifact is persisted in the storage layer with a stable path", async () => {
    const { src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "أ.\n\nب.",
    });
    const ingest = h.makeIngest();
    const res = await ingest.ingestSource(src.id);
    expect(res.artifact).not.toBeNull();
    const id = res.artifact!.id;
    expect(res.artifact!.storagePath).toBe(textArtifactPath(id));
    expect(await h.storage.hasText(id)).toBe(true);
    expect(await h.storage.getText(id)).toBe("أ.\n\nب.");
    const res2 = await ingest.ingestSource(src.id);
    expect(res2.artifact!.id).not.toBe(id);
    expect(await h.storage.hasText(id)).toBe(false);
    expect(await h.storage.hasText(res2.artifact!.id)).toBe(true);
  });

  it("PKG1B-T12: Package 1B.1 does not include AI providers, extraction runs, or forbidden entities", () => {
    const FORBIDDEN = [
      "AIService",
      "AIProvider",
      "ExtractionService",
      "ExtractionRun",
      "OpenAI",
      "Anthropic",
      "GeminiClient",
      "LovableAiGateway",
      "StudentMasterRecord",
      "LearnerProfile",
      "ReviewFinding",
      "SupervisorDecision",
      "ReportAssembly",
      "ReportVersion",
    ];
    const roots = [
      path.join(process.cwd(), "src/features/himam"),
      path.join(process.cwd(), "src/routes"),
    ];
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "__tests__" || e.name === "node_modules") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          files.push(full);
        }
      }
    };
    for (const r of roots) walk(r);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const w of FORBIDDEN) {
        const declRe = new RegExp(`\\b(class|interface|type|enum)\\s+${w}\\b`);
        expect(declRe.test(src), `${w} declared in ${f}`).toBe(false);
        const useRe = new RegExp(
          `\\b(new\\s+${w}|${w}\\.(?:instance|singleton|create))\\b`,
        );
        expect(useRe.test(src), `${w} instantiated in ${f}`).toBe(false);
      }
    }
  });

  it("PKG1B-T13: removing a source cascades to text artifacts, chunks, and evidence", async () => {
    const { c, src } = await setupPlanCase(h, {
      name: "plan.txt",
      type: "text/plain",
      content: "أ.\n\nب.",
    });
    const ingest = h.makeIngest();
    const { artifact, chunks } = await ingest.ingestSource(src.id);
    h.evidence.addManual({
      sourceId: src.id,
      chunkId: chunks[0].chunkId,
      quote: "أ.",
      criterionId: "C001",
      domainId: "D1",
    });
    expect(await h.storage.has(src.id)).toBe(true);
    expect(await h.storage.hasText(artifact!.id)).toBe(true);
    await h.caseSvc.removeSource(src.id);
    expect(await h.storage.has(src.id)).toBe(false);
    expect(await h.storage.hasText(artifact!.id)).toBe(false);
    expect(ingest.chunksFor(src.id)).toEqual([]);
    expect(ingest.artifactFor(src.id)).toBeNull();
    expect(h.evidence.listForCase(c.id)).toEqual([]);
    expect(h.caseSvc.get(c.id)!.status).toBe("draft");
  });
});