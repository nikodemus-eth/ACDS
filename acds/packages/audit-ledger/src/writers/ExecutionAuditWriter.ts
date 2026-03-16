import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export class ExecutionAuditWriter {
  constructor(private readonly writer: AuditEventWriter) {}

  async writeExecutionStarted(
    executionId: string,
    application: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.EXECUTION,
      actor: 'system',
      action: 'execution.started',
      resourceType: 'execution_record',
      resourceId: executionId,
      application,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeExecutionCompleted(
    executionId: string,
    application: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.EXECUTION,
      actor: 'system',
      action: 'execution.completed',
      resourceType: 'execution_record',
      resourceId: executionId,
      application,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeExecutionFailed(
    executionId: string,
    application: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.EXECUTION,
      actor: 'system',
      action: 'execution.failed',
      resourceType: 'execution_record',
      resourceId: executionId,
      application,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }
}
