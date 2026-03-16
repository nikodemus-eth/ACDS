import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export class RoutingAuditWriter {
  constructor(private readonly writer: AuditEventWriter) {}

  async writeRouteResolved(
    routingDecisionId: string,
    application: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.ROUTING,
      actor: 'system',
      action: 'routing.resolved',
      resourceType: 'routing_decision',
      resourceId: routingDecisionId,
      application,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeRouteFallback(
    routingDecisionId: string,
    application: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.ROUTING,
      actor: 'system',
      action: 'routing.fallback',
      resourceType: 'routing_decision',
      resourceId: routingDecisionId,
      application,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }
}
