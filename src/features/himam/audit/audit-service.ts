import type { AuditEvent, AuditEventType } from "./audit-types";

function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newAuditEvent(
  reviewCaseId: string,
  eventType: AuditEventType,
  payload: Record<string, unknown> = {},
  actorId: string | null = null,
): AuditEvent {
  return {
    id: cryptoRandomId(),
    reviewCaseId,
    eventType,
    actorId,
    payload,
    createdAt: new Date().toISOString(),
  };
}
