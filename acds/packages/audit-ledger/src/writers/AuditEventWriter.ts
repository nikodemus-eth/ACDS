import type { AuditEventType } from '@acds/core-types';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  application: string | null;
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditEventWriter {
  write(event: AuditEvent): Promise<void>;
  writeBatch(events: AuditEvent[]): Promise<void>;
}
