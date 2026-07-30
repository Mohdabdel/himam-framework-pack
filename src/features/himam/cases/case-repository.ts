import type { AuditEvent } from "../audit/audit-types";
import type {
  ExtractedEvidence,
  ExtractionRun,
  IdentityIntegrityCheck,
  InputSource,
  LegacyEvidenceCandidate,
  ReviewCase,
  ReviewScopeSnapshot,
  TextArtifact,
  TextChunk,
  TextLocator,
} from "./case-types";
import type {
  GovernedReportVersion,
  ReviewFinding,
  ReviewVersion,
} from "../review/review-types";

export interface HimamStore {
  cases: ReviewCase[];
  sources: InputSource[];
  scopeSnapshots: ReviewScopeSnapshot[];
  auditEvents: AuditEvent[];
  textArtifacts: TextArtifact[];
  textChunks: TextChunk[];
  extractedEvidence: ExtractedEvidence[];
  extractionRuns: ExtractionRun[];
  identityChecks: IdentityIntegrityCheck[];
  reviewVersions: ReviewVersion[];
  reviewFindings: ReviewFinding[];
  reportVersions: GovernedReportVersion[];
}

export interface ReviewCaseRepository {
  load(): HimamStore;
  save(store: HimamStore): void;
  reset(): void;
}

const EMPTY: HimamStore = {
  cases: [],
  sources: [],
  scopeSnapshots: [],
  auditEvents: [],
  textArtifacts: [],
  textChunks: [],
  extractedEvidence: [],
  extractionRuns: [],
  identityChecks: [],
  reviewVersions: [],
  reviewFindings: [],
  reportVersions: [],
};

const STORAGE_KEY = "himam.pkg1a.store.v1";

function migrateSources(list: InputSource[] | undefined): InputSource[] {
  return (list ?? []).map((s) => ({
    ...s,
    extractionStage: s.extractionStage ?? "not_started",
    sourceHash: (s as InputSource).sourceHash ?? null,
    languageHint: (s as InputSource).languageHint ?? null,
    unavailableResolution: (s as InputSource).unavailableResolution ?? null,
    manualTextArtifactId: (s as InputSource).manualTextArtifactId ?? null,
  }));
}

function migrateCases(list: ReviewCase[] | undefined): ReviewCase[] {
  return (list ?? []).map((c) => ({
    ...c,
    extractionStage: c.extractionStage ?? "not_started",
    scopeNeedsReconfirmation: c.scopeNeedsReconfirmation ?? false,
  }));
}

function migrateArtifacts(list: TextArtifact[] | undefined): TextArtifact[] {
  return (list ?? []).map((a) => ({
    ...a,
    sourceHash: a.sourceHash ?? "",
    fullTextHash: a.fullTextHash ?? "",
    parserName: a.parserName ?? "legacy",
    parserVersion: a.parserVersion ?? "1",
    generatedAt: a.generatedAt ?? a.extractedAt,
  }));
}

function migrateChunks(list: TextChunk[] | undefined): TextChunk[] {
  return (list ?? []).map((c) => {
    const loc: TextLocator =
      c.locator ??
      (c.pageNumber !== null
        ? { kind: "pdf_page", pageNumber: c.pageNumber }
        : { kind: "text_lines", lineStart: 0, lineEnd: 0 });
    return { ...c, locator: loc, textHash: c.textHash ?? "" };
  });
}

function migrateEvidence(
  legacy: LegacyEvidenceCandidate[] | undefined,
  modern: ExtractedEvidence[] | undefined,
): ExtractedEvidence[] {
  const out: ExtractedEvidence[] = (modern ?? []).slice();
  for (const ev of legacy ?? []) {
    // Skip legacy items that already look modern-shaped (missing quote/etc).
    if (!("quote" in ev)) continue;
    const status: ExtractedEvidence["status"] =
      ev.status === "proposed" ? "pending" : ev.status === "confirmed" ? "confirmed" : "rejected";
    out.push({
      id: ev.id,
      reviewCaseId: ev.reviewCaseId,
      sourceId: ev.sourceId,
      sourceChunkId: ev.chunkId,
      extractionRunId: null,
      evidenceType: "other",
      exactQuote: ev.quote,
      normalizedText: ev.quote,
      locator: { kind: "manual_text", sectionId: "legacy" },
      sourceHash: "",
      extractionMethod: ev.origin,
      confidence: "not_applicable",
      status,
      createdAt: ev.createdAt,
      updatedAt: ev.decidedAt ?? ev.createdAt,
      confirmedBy: null,
      confirmedAt: status === "confirmed" ? ev.decidedAt : null,
      rejectedReason: null,
      provenance: {
        sourceId: ev.sourceId,
        sourceChunkId: ev.chunkId,
        modelName: null,
        promptId: null,
        temperature: null,
        timestamp: ev.createdAt,
      },
    });
  }
  return out;
}

function inMemoryRepo(): ReviewCaseRepository {
  let state: HimamStore = structuredClone(EMPTY);
  return {
    load: () => structuredClone(state),
    save: (s) => {
      state = structuredClone(s);
    },
    reset: () => {
      state = structuredClone(EMPTY);
    },
  };
}

function localStorageRepo(): ReviewCaseRepository {
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(EMPTY);
        const parsed = JSON.parse(raw) as Partial<HimamStore> & {
          evidenceCandidates?: LegacyEvidenceCandidate[];
        };
        return {
          cases: migrateCases(parsed.cases),
          sources: migrateSources(parsed.sources),
          scopeSnapshots: parsed.scopeSnapshots ?? [],
          auditEvents: parsed.auditEvents ?? [],
          textArtifacts: migrateArtifacts(parsed.textArtifacts),
          textChunks: migrateChunks(parsed.textChunks),
          extractedEvidence: migrateEvidence(parsed.evidenceCandidates, parsed.extractedEvidence),
          extractionRuns: parsed.extractionRuns ?? [],
          identityChecks: parsed.identityChecks ?? [],
          reviewVersions: parsed.reviewVersions ?? [],
          reviewFindings: parsed.reviewFindings ?? [],
          reportVersions: parsed.reportVersions ?? [],
        };
      } catch {
        return structuredClone(EMPTY);
      }
    },
    save: (s) => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    },
    reset: () => {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
}

let defaultRepo: ReviewCaseRepository | null = null;
export function getDefaultRepository(): ReviewCaseRepository {
  if (defaultRepo) return defaultRepo;
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    defaultRepo = localStorageRepo();
  } else {
    defaultRepo = inMemoryRepo();
  }
  return defaultRepo;
}

export function createInMemoryRepository(): ReviewCaseRepository {
  return inMemoryRepo();
}

// Exposed so integration tests can exercise the exact serialization +
// migration path the browser uses (JSON in localStorage), not just the
// structuredClone in-memory shortcut.
export function createLocalStorageRepository(): ReviewCaseRepository {
  return localStorageRepo();
}
