import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type {
  EvidenceConfidence,
  EvidenceProvenance,
  EvidenceType,
  ExtractedEvidence,
  InputSourceType,
  TextChunk,
  TextLocator,
} from "../cases/case-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Package 1B.2 — allowed EvidenceType per InputSourceType. Enforced at
// creation time; violations are rejected before any Evidence is persisted.
export const ALLOWED_EVIDENCE_TYPES: Record<InputSourceType, EvidenceType[]> = {
  plan: [
    "plan_goal",
    "baseline_statement",
    "need_statement",
    "support",
    "accommodation",
    "progress_measure",
    "decision_rule",
    "identity_marker",
    "other",
  ],
  assessment: [
    "assessment_finding",
    "baseline_statement",
    "need_statement",
    "identity_marker",
    "other",
  ],
  family_priorities: ["family_priority", "identity_marker", "other"],
  student_preferences: ["student_preference", "identity_marker", "other"],
  supports: ["support", "accommodation", "identity_marker", "other"],
  professional_notes: ["professional_observation", "identity_marker", "other"],
  prior_plan: ["prior_goal", "baseline_statement", "identity_marker", "other"],
  prior_progress: ["prior_progress", "progress_measure", "identity_marker", "other"],
};

export function isEvidenceTypeAllowed(
  sourceType: InputSourceType,
  evidenceType: EvidenceType,
): boolean {
  return ALLOWED_EVIDENCE_TYPES[sourceType].includes(evidenceType);
}

export interface CreateManualEvidenceInput {
  sourceId: string;
  chunkId: string;
  exactQuote: string;
  evidenceType: EvidenceType;
  normalizedText?: string;
}

export interface AiEvidenceDraft {
  sourceId: string;
  chunkId: string;
  evidenceType: EvidenceType;
  exactQuote: string;
  normalizedText: string;
  confidence: EvidenceConfidence;
  extractionRunId: string;
  locator: TextLocator;
  sourceHash: string;
  provenance: EvidenceProvenance;
}

export class EvidenceService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  private getChunk(chunkId: string, sourceId: string): TextChunk {
    const store = this.repo.load();
    const chunk = store.textChunks.find((c) => c.chunkId === chunkId);
    if (!chunk) throw new Error("Chunk not found");
    if (chunk.sourceId !== sourceId) throw new Error("Chunk does not belong to source");
    return chunk;
  }

  private assertCaseOpen(reviewCaseId: string) {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === reviewCaseId);
    if (!c) throw new Error("Case not found");
    if (c.status === "closed") throw new Error("Case is closed");
  }

  createManualEvidence(input: CreateManualEvidenceInput): ExtractedEvidence {
    const chunk = this.getChunk(input.chunkId, input.sourceId);
    const store = this.repo.load();
    const src = store.sources.find((s) => s.id === input.sourceId);
    if (!src) throw new Error("Source not found");
    this.assertCaseOpen(src.reviewCaseId);
    if (!isEvidenceTypeAllowed(src.type, input.evidenceType)) {
      throw new Error("Evidence type not allowed for this source");
    }
    const quote = input.exactQuote.trim();
    if (!quote) throw new Error("Quote is empty");
    if (!chunk.text.includes(quote)) {
      throw new Error("Quote is not verbatim from chunk");
    }
    const now = new Date().toISOString();
    const ev: ExtractedEvidence = {
      id: randomId(),
      reviewCaseId: src.reviewCaseId,
      sourceId: src.id,
      sourceChunkId: chunk.chunkId,
      extractionRunId: null,
      evidenceType: input.evidenceType,
      exactQuote: quote,
      normalizedText: (input.normalizedText ?? quote).trim(),
      locator: chunk.locator,
      sourceHash: src.sourceHash ?? "",
      extractionMethod: "manual",
      confidence: "not_applicable",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      confirmedBy: null,
      confirmedAt: null,
      rejectedReason: null,
      provenance: {
        sourceId: src.id,
        sourceChunkId: chunk.chunkId,
        modelName: null,
        promptId: null,
        temperature: null,
        timestamp: now,
      },
    };
    store.extractedEvidence.push(ev);
    store.auditEvents.push(
      newAuditEvent(src.reviewCaseId, "evidence_created", {
        evidenceId: ev.id,
        method: "manual",
        evidenceType: ev.evidenceType,
        chunkId: ev.sourceChunkId,
      }),
    );
    this.repo.save(store);
    return ev;
  }

  createAiEvidenceFromValidatedResult(draft: AiEvidenceDraft): ExtractedEvidence {
    const store = this.repo.load();
    const src = store.sources.find((s) => s.id === draft.sourceId);
    if (!src) throw new Error("Source not found");
    this.assertCaseOpen(src.reviewCaseId);
    // Trust boundary: this method assumes the caller (extraction-validator)
    // already checked verbatim/chunk/sourceHash/type. We still sanity-check.
    const chunk = store.textChunks.find((c) => c.chunkId === draft.chunkId);
    if (!chunk || chunk.sourceId !== src.id) throw new Error("Chunk mismatch");
    if (!chunk.text.includes(draft.exactQuote)) throw new Error("Quote not verbatim");
    if (!isEvidenceTypeAllowed(src.type, draft.evidenceType)) {
      throw new Error("Evidence type not allowed for this source");
    }
    const now = new Date().toISOString();
    const ev: ExtractedEvidence = {
      id: randomId(),
      reviewCaseId: src.reviewCaseId,
      sourceId: src.id,
      sourceChunkId: chunk.chunkId,
      extractionRunId: draft.extractionRunId,
      evidenceType: draft.evidenceType,
      exactQuote: draft.exactQuote,
      normalizedText: draft.normalizedText.trim(),
      locator: chunk.locator,
      sourceHash: draft.sourceHash,
      extractionMethod: "ai",
      confidence: draft.confidence,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      confirmedBy: null,
      confirmedAt: null,
      rejectedReason: null,
      provenance: draft.provenance,
    };
    store.extractedEvidence.push(ev);
    store.auditEvents.push(
      newAuditEvent(src.reviewCaseId, "evidence_created", {
        evidenceId: ev.id,
        method: "ai",
        evidenceType: ev.evidenceType,
        chunkId: ev.sourceChunkId,
        extractionRunId: draft.extractionRunId,
      }),
    );
    this.repo.save(store);
    return ev;
  }

  private mutateEvidence(
    id: string,
    fn: (ev: ExtractedEvidence) => ExtractedEvidence["status"] | null,
    auditEvent:
      | "evidence_confirmed"
      | "evidence_edited"
      | "evidence_rejected"
      | "evidence_invalidated",
    extraPayload: Record<string, unknown> = {},
  ): ExtractedEvidence {
    const store = this.repo.load();
    const ev = store.extractedEvidence.find((e) => e.id === id);
    if (!ev) throw new Error("Evidence not found");
    this.assertCaseOpen(ev.reviewCaseId);
    const newStatus = fn(ev);
    if (newStatus) ev.status = newStatus;
    ev.updatedAt = new Date().toISOString();
    store.auditEvents.push(
      newAuditEvent(ev.reviewCaseId, auditEvent, {
        evidenceId: ev.id,
        evidenceType: ev.evidenceType,
        ...extraPayload,
      }),
    );
    this.repo.save(store);
    return ev;
  }

  confirmEvidence(id: string, actorId: string | null = null): ExtractedEvidence {
    return this.mutateEvidence(
      id,
      (ev) => {
        if (ev.status !== "pending" && ev.status !== "edited") {
          throw new Error("Only pending or edited evidence can be confirmed");
        }
        ev.confirmedBy = actorId;
        ev.confirmedAt = new Date().toISOString();
        return "confirmed";
      },
      "evidence_confirmed",
    );
  }

  editNormalizedText(id: string, normalizedText: string): ExtractedEvidence {
    return this.mutateEvidence(
      id,
      (ev) => {
        if (ev.status !== "pending" && ev.status !== "edited") {
          throw new Error("Only pending or edited evidence can be edited");
        }
        const trimmed = normalizedText.trim();
        if (!trimmed) throw new Error("Normalized text cannot be empty");
        ev.normalizedText = trimmed;
        return "edited";
      },
      "evidence_edited",
    );
  }

  rejectEvidence(id: string, reason?: string): ExtractedEvidence {
    return this.mutateEvidence(
      id,
      (ev) => {
        if (ev.status !== "pending" && ev.status !== "edited") {
          throw new Error("Only pending or edited evidence can be rejected");
        }
        ev.rejectedReason = reason ?? null;
        return "rejected";
      },
      "evidence_rejected",
      { reason: reason ?? null },
    );
  }

  invalidateEvidence(id: string, reason?: string): ExtractedEvidence {
    return this.mutateEvidence(
      id,
      () => "invalidated",
      "evidence_invalidated",
      { reason: reason ?? null },
    );
  }

  listPending(reviewCaseId: string): ExtractedEvidence[] {
    return this.repo
      .load()
      .extractedEvidence.filter(
        (e) => e.reviewCaseId === reviewCaseId && e.status === "pending",
      );
  }

  listExportableConfirmedEvidence(reviewCaseId: string): ExtractedEvidence[] {
    return this.repo
      .load()
      .extractedEvidence.filter(
        (e) =>
          e.reviewCaseId === reviewCaseId &&
          (e.status === "confirmed" || e.status === "edited"),
      );
  }

  listForCase(reviewCaseId: string): ExtractedEvidence[] {
    return this.repo
      .load()
      .extractedEvidence.filter((e) => e.reviewCaseId === reviewCaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listForSource(sourceId: string): ExtractedEvidence[] {
    return this.repo
      .load()
      .extractedEvidence.filter((e) => e.sourceId === sourceId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}