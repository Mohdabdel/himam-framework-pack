import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type { InputSource, TextArtifact, TextChunk } from "../cases/case-types";
import type { SourceArtifactStorage } from "../sources/plan-file-storage";
import { textArtifactPath } from "../sources/plan-file-storage";
import { buildChunks } from "./text-chunker";
import type { DocumentTextExtractor } from "./text-parsers";
import { sha256Hex } from "./hash";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface IngestionResult {
  artifact: TextArtifact | null;
  chunks: TextChunk[];
  source: InputSource;
  reused: boolean;
}

async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Orchestrates one source at a time: reads its stored Blob, runs the
// extractor, replaces any previous artifact+chunks, and updates
// source.extractionStage. It never touches AI providers, evidence, or the
// case status; those are separate concerns.
export class IngestionService {
  constructor(
    private readonly repo: ReviewCaseRepository,
    private readonly storage: SourceArtifactStorage,
    private readonly extractor: DocumentTextExtractor,
  ) {}

  async ingestSource(sourceId: string): Promise<IngestionResult> {
    const preStore = this.repo.load();
    const src = preStore.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error("Source not found");
    if (!src.storagePath) {
      if (src.type === "plan") {
        throw new Error("أرفق الخطة الحالية واحفظها أولًا.");
      }
      throw new Error("Source has no attached file");
    }
    const blob = await this.storage.get(sourceId);
    if (!blob) {
      const store = this.repo.load();
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.extractionStage = "failed";
      if (s.type === "plan") s.status = "file_missing";
      store.auditEvents.push(
        newAuditEvent(s.reviewCaseId, "source_ingest_failed", {
          sourceId,
          reason: "file_missing",
        }),
      );
      // Cascade status recomputation: a plan without its Blob must knock the
      // case back to draft.
      if (s.type === "plan") {
        const c = store.cases.find((x) => x.id === s.reviewCaseId);
        if (c && c.status !== "closed") {
          const hasAgeOrPhase = c.ageYears !== null || c.phaseId !== null;
          const hasPlan = store.sources.some(
            (x) =>
              x.reviewCaseId === c.id &&
              x.type === "plan" &&
              x.status === "ready_for_future_ingestion",
          );
          if (!(hasAgeOrPhase && hasPlan) && c.status !== "draft") {
            c.status = "draft";
            c.updatedAt = new Date().toISOString();
          }
        }
      }
      this.repo.save(store);
      throw new Error(
        src.type === "plan" ? "ملف الخطة مفقود — أعد رفعه." : "File missing",
      );
    }

    const blobHash = await hashBlob(blob);
    // Same blob + already-extracted artifact → reuse everything.
    const existingArtifact = preStore.textArtifacts.find(
      (a) => a.sourceId === sourceId && a.sourceHash === blobHash,
    );
    if (existingArtifact) {
      const store = this.repo.load();
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.sourceHash = blobHash;
      if (s.extractionStage !== "text_extracted") s.extractionStage = "text_extracted";
      this.repo.save(store);
      const chunks = store.textChunks
        .filter((c) => c.artifactId === existingArtifact.id)
        .sort((a, b) => a.order - b.order);
      return { artifact: existingArtifact, chunks, source: { ...s }, reused: true };
    }

    const outcome = await this.extractor.extract(blob, src.mimeType, src.fileName);

    // Blob has changed: invalidate old artifact + evidence for this source.
    const oldArtifacts = preStore.textArtifacts.filter((x) => x.sourceId === sourceId);
    for (const a of oldArtifacts) {
      try {
        await this.storage.deleteText(a.id);
      } catch {
        /* best-effort cleanup */
      }
    }

    if (outcome.kind === "text_unavailable") {
      const store = this.repo.load();
      store.textArtifacts = store.textArtifacts.filter((a) => a.sourceId !== sourceId);
      store.textChunks = store.textChunks.filter((c) => c.sourceId !== sourceId);
      // Invalidate evidence bound to a source whose text is no longer available.
      for (const ev of store.extractedEvidence) {
        if (ev.sourceId === sourceId && ev.status !== "invalidated") {
          ev.status = "invalidated";
          ev.updatedAt = new Date().toISOString();
        }
      }
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.sourceHash = blobHash;
      s.extractionStage = "text_unavailable";
      store.auditEvents.push(
        newAuditEvent(s.reviewCaseId, "source_ingest_failed", {
          sourceId,
          reason: outcome.reason,
        }),
      );
      this.repo.save(store);
      return { artifact: null, chunks: [], source: { ...s }, reused: false };
    }

    const artifactId = randomId();
    const fullText = outcome.pages.map((p) => p.text).join("\n\n");
    const fullTextHash = await sha256Hex(fullText);
    await this.storage.putText(artifactId, fullText);
    const chunks = await buildChunks(sourceId, artifactId, outcome.pages, {
      sourceHash: blobHash,
    });

    const store = this.repo.load();
    store.textArtifacts = store.textArtifacts.filter((a) => a.sourceId !== sourceId);
    store.textChunks = store.textChunks.filter((c) => c.sourceId !== sourceId);
    // Any old evidence bound to this source's chunks is now invalid.
    const nowIso = new Date().toISOString();
    let invalidatedEvidence = 0;
    for (const ev of store.extractedEvidence) {
      if (ev.sourceId === sourceId && ev.status !== "invalidated" && oldArtifacts.length > 0) {
        ev.status = "invalidated";
        ev.updatedAt = nowIso;
        invalidatedEvidence++;
      }
    }
    const s = store.sources.find((x) => x.id === sourceId)!;
    const artifact: TextArtifact = {
      id: artifactId,
      sourceId,
      reviewCaseId: s.reviewCaseId,
      byteSize: outcome.byteSize,
      charCount: fullText.length,
      pageCount: outcome.pages.length,
      storagePath: textArtifactPath(artifactId),
      extractedAt: new Date().toISOString(),
      sourceHash: blobHash,
      fullTextHash,
      parserName: "himam-default",
      parserVersion: "1.0",
      generatedAt: nowIso,
    };
    store.textArtifacts.push(artifact);
    store.textChunks.push(...chunks);
    s.sourceHash = blobHash;
    s.extractionStage = "text_extracted";
    // Bump case pipeline stage when at least one source has usable text and
    // the case has not yet moved past `text_ready`.
    const caseRow = store.cases.find((x) => x.id === s.reviewCaseId);
    if (
      caseRow &&
      (caseRow.extractionStage === "not_started" ||
        caseRow.extractionStage === "sources_registered")
    ) {
      caseRow.extractionStage = "text_ready";
    }
    store.auditEvents.push(
      newAuditEvent(s.reviewCaseId, "source_ingested", {
        sourceId,
        artifactId,
        chunkCount: chunks.length,
      }),
    );
    if (invalidatedEvidence > 0) {
      store.auditEvents.push(
        newAuditEvent(s.reviewCaseId, "evidence_invalidated", {
          sourceId,
          invalidatedCount: invalidatedEvidence,
        }),
      );
    }
    this.repo.save(store);
    return { artifact, chunks, source: { ...s }, reused: false };
  }

  chunksFor(sourceId: string): TextChunk[] {
    return this.repo
      .load()
      .textChunks.filter((c) => c.sourceId === sourceId)
      .sort((a, b) => a.order - b.order);
  }

  artifactFor(sourceId: string): TextArtifact | null {
    return this.repo.load().textArtifacts.find((a) => a.sourceId === sourceId) ?? null;
  }

  // Package 1B.3 helper: ingest free manual text (e.g. family_priorities as
  // typed notes). Bypasses the file-based extractor path but produces the
  // same TextArtifact + TextChunk shape so the evidence UI works the same
  // way. No blob is stored; the text lives in the artifact store only.
  async ingestManualText(sourceId: string, text: string): Promise<IngestionResult> {
    const store0 = this.repo.load();
    const src = store0.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error("Source not found");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Manual text is empty");
    const contentHash = await sha256Hex(trimmed);
    const artifactId = randomId();
    await this.storage.putText(artifactId, trimmed);
    const chunks = await buildChunks(
      sourceId,
      artifactId,
      [
        {
          pageNumber: null,
          text: trimmed,
          locatorKind: "manual_text",
          manualSectionId: sourceId,
        },
      ],
      { sourceHash: contentHash },
    );
    const store = this.repo.load();
    // Purge any prior artifact/chunks for this source
    for (const a of store.textArtifacts.filter((x) => x.sourceId === sourceId)) {
      try {
        await this.storage.deleteText(a.id);
      } catch {
        /* best-effort */
      }
    }
    store.textArtifacts = store.textArtifacts.filter((a) => a.sourceId !== sourceId);
    store.textChunks = store.textChunks.filter((c) => c.sourceId !== sourceId);
    const now = new Date().toISOString();
    const artifact: TextArtifact = {
      id: artifactId,
      sourceId,
      reviewCaseId: src.reviewCaseId,
      byteSize: trimmed.length,
      charCount: trimmed.length,
      pageCount: 1,
      storagePath: textArtifactPath(artifactId),
      extractedAt: now,
      sourceHash: contentHash,
      fullTextHash: contentHash,
      parserName: "manual",
      parserVersion: "1.0",
      generatedAt: now,
    };
    store.textArtifacts.push(artifact);
    store.textChunks.push(...chunks);
    const s = store.sources.find((x) => x.id === sourceId)!;
    s.sourceHash = contentHash;
    s.extractionStage = "text_extracted";
    s.manualTextArtifactId = artifactId;
    if (s.status !== "ready_for_future_ingestion") s.status = "ready_for_future_ingestion";
    const caseRow = store.cases.find((x) => x.id === s.reviewCaseId);
    if (
      caseRow &&
      (caseRow.extractionStage === "not_started" ||
        caseRow.extractionStage === "sources_registered")
    ) {
      caseRow.extractionStage = "text_ready";
    }
    store.auditEvents.push(
      newAuditEvent(s.reviewCaseId, "source_manual_text_added", {
        sourceId,
        chunkCount: chunks.length,
      }),
    );
    this.repo.save(store);
    return { artifact, chunks, source: { ...s }, reused: false };
  }
}
