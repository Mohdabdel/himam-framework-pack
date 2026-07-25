import { newAuditEvent } from "../audit/audit-service";
import type { ReviewCaseRepository } from "../cases/case-repository";
import type { EvidenceCandidate } from "../cases/case-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") return g.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface AddManualEvidenceInput {
  sourceId: string;
  chunkId: string;
  quote: string;
  criterionId: string;
  domainId: string;
}

// Package 1B.1 exposes ONLY the manual evidence path. Every candidate must
// point at a specific chunk and repeat a verbatim substring of that chunk's
// text — otherwise the anti-hallucination rule (File 11) is violated.
export class EvidenceService {
  constructor(private readonly repo: ReviewCaseRepository) {}

  addManual(input: AddManualEvidenceInput): EvidenceCandidate {
    const store = this.repo.load();
    const chunk = store.textChunks.find((c) => c.chunkId === input.chunkId);
    if (!chunk) throw new Error("Chunk not found");
    if (chunk.sourceId !== input.sourceId) {
      throw new Error("Chunk does not belong to source");
    }
    const quote = input.quote.trim();
    if (!quote) throw new Error("Quote is empty");
    if (!chunk.text.includes(quote)) {
      throw new Error("Quote is not verbatim from chunk");
    }
    const src = store.sources.find((s) => s.id === input.sourceId);
    if (!src) throw new Error("Source not found");
    const ev: EvidenceCandidate = {
      id: randomId(),
      reviewCaseId: src.reviewCaseId,
      sourceId: input.sourceId,
      chunkId: input.chunkId,
      criterionId: input.criterionId,
      domainId: input.domainId,
      quote,
      origin: "manual",
      status: "proposed",
      confidence: null,
      provenance: null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    store.evidenceCandidates.push(ev);
    store.auditEvents.push(
      newAuditEvent(src.reviewCaseId, "evidence_proposed", {
        evidenceId: ev.id,
        origin: "manual",
        criterionId: ev.criterionId,
        chunkId: ev.chunkId,
      }),
    );
    this.repo.save(store);
    return ev;
  }

  decide(evidenceId: string, decision: "confirmed" | "rejected"): EvidenceCandidate {
    const store = this.repo.load();
    const ev = store.evidenceCandidates.find((e) => e.id === evidenceId);
    if (!ev) throw new Error("Evidence not found");
    if (ev.status !== "proposed") {
      throw new Error("Only proposed evidence can be decided");
    }
    ev.status = decision;
    ev.decidedAt = new Date().toISOString();
    store.auditEvents.push(
      newAuditEvent(
        ev.reviewCaseId,
        decision === "confirmed" ? "evidence_confirmed" : "evidence_rejected",
        { evidenceId: ev.id, criterionId: ev.criterionId },
      ),
    );
    this.repo.save(store);
    return ev;
  }

  listForSource(sourceId: string): EvidenceCandidate[] {
    return this.repo
      .load()
      .evidenceCandidates.filter((e) => e.sourceId === sourceId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listForCase(reviewCaseId: string): EvidenceCandidate[] {
    return this.repo
      .load()
      .evidenceCandidates.filter((e) => e.reviewCaseId === reviewCaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}