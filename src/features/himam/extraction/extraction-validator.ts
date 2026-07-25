import type { EvidenceType, InputSourceType, TextChunk } from "../cases/case-types";
import { isEvidenceTypeAllowed } from "../evidence/evidence-service";
import type { EvidenceExtractionCandidate, ExtractionProviderResult } from "./extraction-types";

export type ValidationFailure =
  | "malformed_result"
  | "unknown_chunk"
  | "chunk_source_mismatch"
  | "quote_not_verbatim"
  | "source_hash_changed"
  | "evidence_type_forbidden"
  | "empty_candidate";

export interface ValidatedCandidate {
  candidate: EvidenceExtractionCandidate;
  chunk: TextChunk;
}

export interface ValidationResult {
  ok: boolean;
  errorCode: ValidationFailure | null;
  validated: ValidatedCandidate[];
}

// Any single failure is a SAFE STOP: drop every candidate and surface an
// opaque errorCode. Nothing is ever saved as "low-confidence".
export function validateExtractionResult(input: {
  result: ExtractionProviderResult;
  sourceType: InputSourceType;
  currentSourceHash: string;
  chunksById: Map<string, TextChunk>;
  sourceId: string;
}): ValidationResult {
  if (!input.result || !Array.isArray(input.result.candidates)) {
    return { ok: false, errorCode: "malformed_result", validated: [] };
  }
  const validated: ValidatedCandidate[] = [];
  for (const c of input.result.candidates) {
    if (!c || typeof c.exactQuote !== "string" || typeof c.sourceChunkId !== "string") {
      return { ok: false, errorCode: "malformed_result", validated: [] };
    }
    if (!c.exactQuote.trim() || !c.normalizedText || !c.evidenceType) {
      return { ok: false, errorCode: "empty_candidate", validated: [] };
    }
    const chunk = input.chunksById.get(c.sourceChunkId);
    if (!chunk) return { ok: false, errorCode: "unknown_chunk", validated: [] };
    if (chunk.sourceId !== input.sourceId) {
      return { ok: false, errorCode: "chunk_source_mismatch", validated: [] };
    }
    if (!chunk.text.includes(c.exactQuote)) {
      return { ok: false, errorCode: "quote_not_verbatim", validated: [] };
    }
    if (!isEvidenceTypeAllowed(input.sourceType, c.evidenceType as EvidenceType)) {
      return { ok: false, errorCode: "evidence_type_forbidden", validated: [] };
    }
    validated.push({ candidate: c, chunk });
  }
  return { ok: true, errorCode: null, validated };
}
