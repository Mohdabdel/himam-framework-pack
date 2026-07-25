import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type {
  ExtractedEvidence,
  ExtractionRun,
  InputSource,
  TextChunk,
} from "../cases/case-types";
import { EvidenceService } from "../evidence/evidence-service";
import { HIMAM_EXTRACTION_PROMPT_ID } from "./extraction-prompt";
import type {
  EvidenceExtractionProvider,
  ExtractionProviderResult,
} from "./extraction-types";
import { validateExtractionResult } from "./extraction-validator";
import { prepareMinimalExtractionPayload } from "./extraction-payload";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface StartExtractionInput {
  reviewCaseId: string;
  sourceId: string;
  chunkIds?: string[];
}

export interface StartExtractionResult {
  run: ExtractionRun;
  createdEvidence: ExtractedEvidence[];
}

export class ExtractionRunService {
  private readonly evidence: EvidenceService;
  constructor(
    private readonly repo: ReviewCaseRepository,
    private readonly provider: EvidenceExtractionProvider,
  ) {
    this.evidence = new EvidenceService(repo);
  }

  async start(input: StartExtractionInput): Promise<StartExtractionResult> {
    const store0 = this.repo.load();
    const src = store0.sources.find((s) => s.id === input.sourceId);
    if (!src) throw new Error("Source not found");
    const c = store0.cases.find((x) => x.id === input.reviewCaseId);
    if (!c) throw new Error("Case not found");
    if (c.status === "closed") throw new Error("Case is closed");
    const chunks: TextChunk[] = store0.textChunks.filter(
      (ch) =>
        ch.sourceId === input.sourceId &&
        (!input.chunkIds || input.chunkIds.includes(ch.chunkId)),
    );
    if (chunks.length === 0) throw new Error("No chunks available");

    const runId = randomId();
    const payload = prepareMinimalExtractionPayload({
      reviewCaseId: input.reviewCaseId,
      source: src as InputSource,
      chunks,
    });

    // Register the run as processing before hitting the provider.
    const mkStore = this.repo.load();
    const run: ExtractionRun = {
      id: runId,
      reviewCaseId: input.reviewCaseId,
      sourceIds: [input.sourceId],
      sourceHashes: [src.sourceHash ?? ""],
      providerId: this.provider.providerId,
      modelName: null,
      promptId: HIMAM_EXTRACTION_PROMPT_ID,
      temperature: null,
      status: "processing",
      startedAt: new Date().toISOString(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      inputChunkIds: chunks.map((c) => c.chunkId),
      createdEvidenceIds: [],
    };
    mkStore.extractionRuns.push(run);
    const caseRow = mkStore.cases.find((x) => x.id === input.reviewCaseId)!;
    caseRow.extractionStage = "extraction_in_progress";
    mkStore.auditEvents.push(
      newAuditEvent(input.reviewCaseId, "extraction_started", {
        runId,
        sourceId: input.sourceId,
        chunkCount: chunks.length,
      }),
    );
    this.repo.save(mkStore);

    // Provider call happens outside the repo mutation window.
    let result: ExtractionProviderResult;
    try {
      result = await this.provider.extract(payload);
    } catch (err) {
      return this.completeFailure(runId, "provider_error", (err as Error).message ?? null);
    }

    const chunksById = new Map(chunks.map((c) => [c.chunkId, c]));
    const validation = validateExtractionResult({
      result,
      sourceType: src.type,
      currentSourceHash: src.sourceHash ?? "",
      chunksById,
      sourceId: input.sourceId,
    });
    if (!validation.ok || !result.ok) {
      return this.completeSafeStop(runId, result, validation.errorCode);
    }
    const nowStore = this.repo.load();
    const nowSrc = nowStore.sources.find((s) => s.id === input.sourceId);
    if (!nowSrc || nowSrc.sourceHash !== src.sourceHash) {
      return this.completeSafeStop(runId, result, "source_hash_changed");
    }

    const created: ExtractedEvidence[] = [];
    for (const v of validation.validated) {
      const ev = this.evidence.createAiEvidenceFromValidatedResult({
        sourceId: input.sourceId,
        chunkId: v.chunk.chunkId,
        evidenceType: v.candidate.evidenceType,
        exactQuote: v.candidate.exactQuote,
        normalizedText: v.candidate.normalizedText,
        confidence: v.candidate.confidence,
        extractionRunId: runId,
        locator: v.chunk.locator,
        sourceHash: src.sourceHash ?? "",
        provenance: {
          sourceId: input.sourceId,
          sourceChunkId: v.chunk.chunkId,
          modelName: result.modelName,
          promptId: HIMAM_EXTRACTION_PROMPT_ID,
          temperature: null,
          timestamp: new Date().toISOString(),
        },
      });
      created.push(ev);
    }

    const finalStore = this.repo.load();
    const finalRun = finalStore.extractionRuns.find((r) => r.id === runId)!;
    finalRun.status = "completed";
    finalRun.modelName = result.modelName;
    finalRun.completedAt = new Date().toISOString();
    finalRun.createdEvidenceIds = created.map((e) => e.id);
    const caseFin = finalStore.cases.find((x) => x.id === input.reviewCaseId)!;
    caseFin.extractionStage = "confirmation_required";
    finalStore.auditEvents.push(
      newAuditEvent(input.reviewCaseId, "extraction_completed", {
        runId,
        createdCount: created.length,
      }),
    );
    this.repo.save(finalStore);
    return { run: finalRun, createdEvidence: created };
  }

  private completeSafeStop(
    runId: string,
    result: ExtractionProviderResult,
    errorCode: string | null,
  ): StartExtractionResult {
    const store = this.repo.load();
    const run = store.extractionRuns.find((r) => r.id === runId)!;
    run.status = "safe_stopped";
    run.errorCode = errorCode ?? result.errorCode ?? "safe_stop";
    run.errorMessage = null;
    run.completedAt = new Date().toISOString();
    const caseRow = store.cases.find((x) => x.id === run.reviewCaseId)!;
    if (caseRow.extractionStage === "extraction_in_progress") {
      caseRow.extractionStage = "text_ready";
    }
    store.auditEvents.push(
      newAuditEvent(run.reviewCaseId, "extraction_safe_stopped", {
        runId,
        errorCode: run.errorCode,
      }),
    );
    this.repo.save(store);
    return { run, createdEvidence: [] };
  }

  private completeFailure(
    runId: string,
    errorCode: string,
    message: string | null,
  ): StartExtractionResult {
    const store = this.repo.load();
    const run = store.extractionRuns.find((r) => r.id === runId)!;
    run.status = "failed";
    run.errorCode = errorCode;
    run.errorMessage = message ? "provider_error" : null;
    run.completedAt = new Date().toISOString();
    const caseRow = store.cases.find((x) => x.id === run.reviewCaseId)!;
    if (caseRow.extractionStage === "extraction_in_progress") {
      caseRow.extractionStage = "text_ready";
    }
    store.auditEvents.push(
      newAuditEvent(run.reviewCaseId, "extraction_failed", { runId, errorCode }),
    );
    this.repo.save(store);
    return { run, createdEvidence: [] };
  }

  runsForCase(reviewCaseId: string): ExtractionRun[] {
    return this.repo
      .load()
      .extractionRuns.filter((r) => r.reviewCaseId === reviewCaseId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}