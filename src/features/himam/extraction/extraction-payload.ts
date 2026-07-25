import type { InputSource, TextChunk } from "../cases/case-types";
import { ALLOWED_EVIDENCE_TYPES } from "../evidence/evidence-service";
import type { EvidenceExtractionProviderInput, SourceTextChunk } from "./extraction-types";
import { HIMAM_EXTRACTION_PROMPT_ID } from "./extraction-prompt";

// Data-minimization boundary. Provider sees only source type, chunks
// (chunkId + text + locator), the prompt id, and the opaque case id.
// It never sees referenceCode, fileName, storagePath, blob, ageYears, or
// any per-user identity — see PKG1B-T17.
export function prepareMinimalExtractionPayload(input: {
  reviewCaseId: string;
  source: InputSource;
  chunks: TextChunk[];
}): EvidenceExtractionProviderInput {
  const minimalChunks: SourceTextChunk[] = input.chunks.map((c) => ({
    sourceChunkId: c.chunkId,
    text: c.text,
    locator: c.locator,
  }));
  return {
    reviewCaseId: input.reviewCaseId,
    sourceType: input.source.type,
    chunks: minimalChunks,
    allowedEvidenceTypes: ALLOWED_EVIDENCE_TYPES[input.source.type],
    promptId: HIMAM_EXTRACTION_PROMPT_ID,
  };
}
