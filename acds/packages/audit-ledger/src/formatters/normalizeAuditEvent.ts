import type { AuditEvent } from '../writers/AuditEventWriter.js';

export interface NormalizedAuditEvent {
  id: string;
  eventType: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  application: string | null;
  details: Record<string, unknown>;
  timestamp: string;
}

export function normalizeAuditEvent(event: AuditEvent): NormalizedAuditEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    actor: event.actor,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    application: event.application,
    details: event.details,
    timestamp: event.timestamp.toISOString(),
  };
}
