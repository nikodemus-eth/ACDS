import { describe, it, expect } from 'vitest';
import { ProviderAuditWriter } from './ProviderAuditWriter.js';
import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';

class InMemoryAuditWriter implements AuditEventWriter {
  readonly events: AuditEvent[] = [];

  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async writeBatch(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

describe('ProviderAuditWriter', () => {
  it('writeProviderCreated writes an event with action provider.created', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderCreated('prov-1', 'admin', { name: 'OpenAI' });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('provider.created');
    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('admin');
    expect(event.resourceType).toBe('provider');
    expect(event.resourceId).toBe('prov-1');
    expect(event.application).toBeNull();
    expect(event.details).toEqual({ name: 'OpenAI' });
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('writeProviderUpdated writes an event with action provider.updated', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderUpdated('prov-2', 'ops', { maxTokens: 4096 });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('provider.updated');
    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('ops');
    expect(event.resourceId).toBe('prov-2');
    expect(event.details).toEqual({ maxTokens: 4096 });
  });

  it('writeProviderDisabled writes an event with empty details', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderDisabled('prov-3', 'admin');

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('provider.disabled');
    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('admin');
    expect(event.resourceId).toBe('prov-3');
    expect(event.details).toEqual({});
  });

  it('writeSecretRotated writes an event with SECURITY type', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ProviderAuditWriter(store);

    await writer.writeSecretRotated('prov-4', 'security-bot');

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('provider.secret_rotated');
    expect(event.eventType).toBe(AuditEventType.SECURITY);
    expect(event.actor).toBe('security-bot');
    expect(event.resourceType).toBe('provider');
    expect(event.resourceId).toBe('prov-4');
    expect(event.application).toBeNull();
    expect(event.details).toEqual({});
  });

  it('each write generates a unique event id', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderCreated('p1', 'a', {});
    await writer.writeProviderUpdated('p1', 'a', {});

    expect(store.events[0].id).not.toBe(store.events[1].id);
  });
});
