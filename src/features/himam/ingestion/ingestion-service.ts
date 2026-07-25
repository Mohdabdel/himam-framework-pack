import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type { InputSource, TextArtifact, TextChunk } from "../cases/case-types";
import type { SourceArtifactStorage } from "../sources/plan-file-storage";
import { textArtifactPath } from "../sources/plan-file-storage";
import { buildChunks } from "./text-chunker";
import type { DocumentTextExtractor } from "./text-parsers";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface IngestionResult {
  artifact: TextArtifact | null;
  chunks: TextChunk[];
  source: InputSource;
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
      throw new Error("Source has no attached file");
    }
    const blob = await this.storage.get(sourceId);
    if (!blob) {
      const store = this.repo.load();
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.extractionStage = "failed";
      store.auditEvents.push(
        newAuditEvent(s.reviewCaseId, "source_ingest_failed", {
          sourceId,
          reason: "file_missing",
        }),
      );
      this.repo.save(store);
      throw new Error("File missing");
    }

    const outcome = await this.extractor.extract(blob, src.mimeType, src.fileName);

    // A re-ingest replaces, never appends: purge any old artifact Blobs first.
    for (const a of preStore.textArtifacts.filter((x) => x.sourceId === sourceId)) {
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
      const s = store.sources.find((x) => x.id === sourceId)!;
      s.extractionStage = "text_unavailable";
      store.auditEvents.push(
        newAuditEvent(s.reviewCaseId, "source_ingest_failed", {
          sourceId,
          reason: outcome.reason,
        }),
      );
      this.repo.save(store);
      return { artifact: null, chunks: [], source: { ...s } };
    }

    const artifactId = randomId();
    const fullText = outcome.pages.map((p) => p.text).join("\n\n");
    await this.storage.putText(artifactId, fullText);
    const chunks = await buildChunks(sourceId, artifactId, outcome.pages);

    const store = this.repo.load();
    store.textArtifacts = store.textArtifacts.filter((a) => a.sourceId !== sourceId);
    store.textChunks = store.textChunks.filter((c) => c.sourceId !== sourceId);
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
    };
    store.textArtifacts.push(artifact);
    store.textChunks.push(...chunks);
    s.extractionStage = "text_extracted";
    store.auditEvents.push(
      newAuditEvent(s.reviewCaseId, "source_ingested", {
        sourceId,
        artifactId,
        chunkCount: chunks.length,
      }),
    );
    this.repo.save(store);
    return { artifact, chunks, source: { ...s } };
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
}