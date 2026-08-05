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
  | "evidence_rejected"
  // Package 1B.2 additions:
  | "source_blob_stored"
  | "source_manual_text_added"
  | "source_replaced"
  | "source_ingestion_started"
  | "source_ingestion_completed"
  | "source_ingestion_failed"
  | "extraction_started"
  | "extraction_completed"
  | "extraction_failed"
  | "extraction_safe_stopped"
  | "evidence_created"
  | "evidence_edited"
  | "evidence_invalidated"
  | "identity_conflict_detected"
  | "identity_conflict_acknowledged"
  | "scope_reconfirmation_required"
  | "scope_reconfirmed"
  | "extraction_confirmation_completed"
  // Package 1C additions
  | "review_engine_run"
  | "review_marked_stale"
  | "review_completed"
  | "finding_decided"
  | "review_results_attested"
  | "system_classifications_acknowledged"
  | "report_published"
  // Package 1C.3 report events
  | "report_gate_checked"
  | "report_draft_generated"
  | "report_finalized"
  | "report_marked_stale"
  | "report_superseded"
  | "report_version_viewed"
  | "report_version_compared"
  | "case_closed_after_report";

export interface AuditEvent {
  id: string;
  reviewCaseId: string;
  eventType: AuditEventType;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
