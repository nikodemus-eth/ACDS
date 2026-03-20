import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { RoutingAuditWriter } from './RoutingAuditWriter.js';
import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { PgAuditEventRepository } from '@acds/persistence-pg';
import { AuditEventType } from '@acds/core-types';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE audit_events CASCADE');
});

afterAll(async () => {
  await closePool();
});

/**
 * PG-backed AuditEventWriter that writes to the audit_events table.
 * This is a real PostgreSQL implementation — not a mock.
 */
class PgAuditEventWriter implements AuditEventWriter {
  constructor(private readonly p: PoolLike) {}

  async write(event: AuditEvent): Promise<void> {
    await this.p.query(
      `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, application, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [event.id, event.eventType, event.actor, event.action, event.resourceType, event.resourceId, event.application, JSON.stringify(event.details), event.timestamp],
    );
  }

  async writeBatch(events: AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.write(event);
    }
  }
}

/** Read all audit events back from PG for assertions. */
async function readAllEvents(): Promise<AuditEvent[]> {
  const reader = new PgAuditEventRepository(pool as any);
  return reader.find({ limit: 100 });
}

describe('RoutingAuditWriter', () => {
  it('writeRouteResolved writes an event with action routing.resolved', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteResolved('rd-1', 'my-app', { provider: 'anthropic' });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
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
    const store = new PgAuditEventWriter(pool);
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteFallback('rd-2', 'app-2', { reason: 'primary_unavailable' });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('routing.fallback');
    expect(event.eventType).toBe(AuditEventType.ROUTING);
    expect(event.actor).toBe('system');
    expect(event.resourceId).toBe('rd-2');
    expect(event.application).toBe('app-2');
    expect(event.details).toEqual({ reason: 'primary_unavailable' });
  });

  it('each write generates a unique event id', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new RoutingAuditWriter(store);

    await writer.writeRouteResolved('r1', 'app', {});
    await writer.writeRouteFallback('r1', 'app', {});

    const events = await readAllEvents();
    expect(events[0].id).not.toBe(events[1].id);
  });
});
