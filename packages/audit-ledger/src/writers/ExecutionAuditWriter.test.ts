import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ExecutionAuditWriter } from './ExecutionAuditWriter.js';
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

describe('ExecutionAuditWriter', () => {
  it('writeExecutionStarted writes an event with action execution.started', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionStarted('exec-1', 'my-app', { input: 'hello' });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('execution.started');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.actor).toBe('system');
    expect(event.resourceType).toBe('execution_record');
    expect(event.resourceId).toBe('exec-1');
    expect(event.application).toBe('my-app');
    expect(event.details).toEqual({ input: 'hello' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
  });

  it('writeExecutionCompleted writes an event with action execution.completed', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionCompleted('exec-2', 'app-2', { tokens: 100 });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('execution.completed');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.resourceId).toBe('exec-2');
    expect(event.application).toBe('app-2');
    expect(event.details).toEqual({ tokens: 100 });
  });

  it('writeExecutionFailed writes an event with action execution.failed', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionFailed('exec-3', 'app-3', { error: 'timeout' });

    const events = await readAllEvents();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('execution.failed');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.resourceId).toBe('exec-3');
    expect(event.details).toEqual({ error: 'timeout' });
  });

  it('each write generates a unique event id', async () => {
    const store = new PgAuditEventWriter(pool);
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionStarted('e1', 'app', {});
    await writer.writeExecutionCompleted('e1', 'app', {});

    const events = await readAllEvents();
    expect(events[0].id).not.toBe(events[1].id);
  });
});
