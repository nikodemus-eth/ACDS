import type { AuditEvent } from '../writers/AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export function buildProviderEvent(
  action: string,
  providerId: string,
  actor: string,
  details: Record<string, unknown> = {}
): AuditEvent {
  return {
    id: randomUUID(),
    eventType: AuditEventType.PROVIDER,
    actor,
    action,
    resourceType: 'provider',
    resourceId: providerId,
    application: null,
    details,
    timestamp: new Date(),
  };
}
