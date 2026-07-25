import type { EvidenceType, InputSourceType } from "../cases/case-types";
import { ALLOWED_EVIDENCE_TYPES } from "../evidence/evidence-service";

export const HIMAM_EXTRACTION_PROMPT_ID = "HIMAM_EXTRACTION_V1";
export const HIMAM_EXTRACTION_PROMPT_VERSION = 1;

export interface EvidenceExtractionPromptContract {
  promptId: string;
  version: number;
  allowedFor(sourceType: InputSourceType): EvidenceType[];
  systemInstruction: string;
}

// Short frozen contract. Guardrails live in extraction-validator.ts, not
// in "please don't hallucinate" natural language.
export const HIMAM_EXTRACTION_PROMPT: EvidenceExtractionPromptContract = {
  promptId: HIMAM_EXTRACTION_PROMPT_ID,
  version: HIMAM_EXTRACTION_PROMPT_VERSION,
  allowedFor(sourceType) {
    return ALLOWED_EVIDENCE_TYPES[sourceType];
  },
  systemInstruction: [
    "You extract evidence from a single source chunk.",
    "You MUST copy exactQuote verbatim from the provided chunk text.",
    "You MUST return the exact sourceChunkId that was given.",
    "You MAY classify evidenceType only from the allowed list.",
    "You MAY write a short normalizedText description.",
    "You MAY set confidence to high | medium | low | not_applicable.",
    "You MUST NOT invent goals, needs, diagnoses, eligibility, services,",
    "placement, quality judgments, review criteria, domainId, criterionId,",
    "status, severity, recommendations, or page/paragraph numbers.",
    "You MUST NOT merge quotes from different chunks.",
    "Output JSON matching the provided schema only.",
  ].join(" "),
};
