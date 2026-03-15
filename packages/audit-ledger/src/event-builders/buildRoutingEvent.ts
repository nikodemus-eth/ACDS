import type { AuditEvent } from '../writers/AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export function buildRoutingEvent(
  action: string,
  routingDecisionId: string,
  application: string,
  details: Record<string, unknown> = {}
): AuditEvent {
  return {
    id: randomUUID(),
    eventType: AuditEventType.ROUTING,
    actor: 'system',
    action,
    resourceType: 'routing_decision',
    resourceId: routingDecisionId,
    application,
    details,
    timestamp: new Date(),
  };
}
