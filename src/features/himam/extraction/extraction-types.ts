import type {
  EvidenceConfidence,
  EvidenceType,
  InputSourceType,
  TextLocator,
} from "../cases/case-types";

// Minimal chunk shape sent to the provider — no IDs, filenames, ages, or
// storage paths. Data minimization is enforced by prepareMinimalExtractionPayload.
export interface SourceTextChunk {
  sourceChunkId: string;
  text: string;
  locator: TextLocator;
}

export type ExtractionProviderAvailability =
  | "configured"
  | "not_configured"
  | "unavailable";

export interface EvidenceExtractionCandidate {
  sourceChunkId: string;
  evidenceType: EvidenceType;
  exactQuote: string;
  normalizedText: string;
  confidence: EvidenceConfidence;
}

export interface ExtractionProviderResult {
  ok: boolean;
  candidates: EvidenceExtractionCandidate[];
  modelName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface EvidenceExtractionProviderInput {
  reviewCaseId: string;
  sourceType: InputSourceType;
  chunks: SourceTextChunk[];
  allowedEvidenceTypes: EvidenceType[];
  promptId: string;
}

export interface EvidenceExtractionProvider {
  providerId: string;
  availability(): Promise<ExtractionProviderAvailability>;
  extract(input: EvidenceExtractionProviderInput): Promise<ExtractionProviderResult>;
}