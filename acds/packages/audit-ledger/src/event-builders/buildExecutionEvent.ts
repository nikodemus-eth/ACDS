import type { AuditEvent } from '../writers/AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export function buildExecutionEvent(
  action: string,
  executionId: string,
  application: string,
  details: Record<string, unknown> = {}
): AuditEvent {
  return {
    id: randomUUID(),
    eventType: AuditEventType.EXECUTION,
    actor: 'system',
    action,
    resourceType: 'execution_record',
    resourceId: executionId,
    application,
    details,
    timestamp: new Date(),
  };
}
