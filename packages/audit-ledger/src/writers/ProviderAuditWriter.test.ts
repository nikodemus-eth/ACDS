import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ProviderAuditWriter } from './ProviderAuditWriter.js';
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

describe('ProviderAuditWriter', () => {
  it('writeProviderCreated writes an event with action provider.created', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderCreated('prov-1', 'admin', { name: 'OpenAI' });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
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
    const store = new PgAuditEventWriter(pool);
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderUpdated('prov-2', 'ops', { maxTokens: 4096 });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('provider.updated');
    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('ops');
    expect(event.resourceId).toBe('prov-2');
    expect(event.details).toEqual({ maxTokens: 4096 });
  });

  it('writeProviderDisabled writes an event with empty details', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderDisabled('prov-3', 'admin');

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('provider.disabled');
    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('admin');
    expect(event.resourceId).toBe('prov-3');
    expect(event.details).toEqual({});
  });

  it('writeSecretRotated writes an event with SECURITY type', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ProviderAuditWriter(store);

    await writer.writeSecretRotated('prov-4', 'security-bot');

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('provider.secret_rotated');
    expect(event.eventType).toBe(AuditEventType.SECURITY);
    expect(event.actor).toBe('security-bot');
    expect(event.resourceType).toBe('provider');
    expect(event.resourceId).toBe('prov-4');
    expect(event.application).toBeNull();
    expect(event.details).toEqual({});
  });

  it('each write generates a unique event id', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ProviderAuditWriter(store);

    await writer.writeProviderCreated('p1', 'a', {});
    await writer.writeProviderUpdated('p1', 'a', {});

    const events = await readAllEvents();
    expect(events[0].id).not.toBe(events[1].id);
  });
});
