import { describe, it, expect } from 'vitest';
import { RoutingAuditWriter } from './RoutingAuditWriter.js';
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

describe('RoutingAuditWriter', () => {
  it('writeRouteResolved writes an event with action routing.resolved', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteResolved('rd-1', 'my-app', { provider: 'anthropic' });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('routing.resolved');
    expect(event.eventType).toBe(AuditEventType.ROUTING);
    expect(event.actor).toBe('system');
    expect(event.resourceType).toBe('routing_decision');
    expect(event.resourceId).toBe('rd-1');
    expect(event.application).toBe('my-app');
    expect(event.details).toEqual({ provider: 'anthropic' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
  });

  it('writeRouteFallback writes an event with action routing.fallback', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteFallback('rd-2', 'app-2', { reason: 'primary_unavailable' });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('routing.fallback');
    expect(event.eventType).toBe(AuditEventType.ROUTING);
    expect(event.actor).toBe('system');
    expect(event.resourceId).toBe('rd-2');
    expect(event.application).toBe('app-2');
    expect(event.details).toEqual({ reason: 'primary_unavailable' });
  });

  it('each write generates a unique event id', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteResolved('r1', 'app', {});
    await writer.writeRouteFallback('r1', 'app', {});

    expect(store.events[0].id).not.toBe(store.events[1].id);
  });
});
