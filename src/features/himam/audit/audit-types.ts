export type AuditEventType =
  | "case_created"
  | "case_updated"
  | "source_registered"
  | "source_removed"
  | "scope_generated"
  | "scope_confirmed"
  | "case_closed"
  | "source_ingested"
  | "source_ingest_failed"
  | "evidence_proposed"
  | "evidence_confirmed"
  | "evidence_rejected";

export interface AuditEvent {
  id: string;
  reviewCaseId: string;
  eventType: AuditEventType;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
