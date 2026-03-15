import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export class ProviderAuditWriter {
  constructor(private readonly writer: AuditEventWriter) {}

  async writeProviderCreated(providerId: string, actor: string, details: Record<string, unknown>): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.PROVIDER,
      actor,
      action: 'provider.created',
      resourceType: 'provider',
      resourceId: providerId,
      application: null,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeProviderUpdated(providerId: string, actor: string, details: Record<string, unknown>): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.PROVIDER,
      actor,
      action: 'provider.updated',
      resourceType: 'provider',
      resourceId: providerId,
      application: null,
      details,
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeProviderDisabled(providerId: string, actor: string): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.PROVIDER,
      actor,
      action: 'provider.disabled',
      resourceType: 'provider',
      resourceId: providerId,
      application: null,
      details: {},
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }

  async writeSecretRotated(providerId: string, actor: string): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: AuditEventType.SECURITY,
      actor,
      action: 'provider.secret_rotated',
      resourceType: 'provider',
      resourceId: providerId,
      application: null,
      details: {},
      timestamp: new Date(),
    };
    await this.writer.write(event);
  }
}
