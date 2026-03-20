// Integration Tests – PgAuditEmitters (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgApprovalAuditEmitter, PgRollbackAuditEmitter } from './PgAuditEmitters.js';
import type { ApprovalAuditEvent, RollbackAuditEvent } from '@acds/adaptive-optimizer';
import {
  createTestPool, runMigrations, truncateAll, closePool, type PoolLike,
} from '../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});
afterAll(async () => { await closePool(); });
beforeEach(async () => { await truncateAll(pool); });

async function waitForRow(pool: PoolLike, resourceId: string, maxMs = 2000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await pool.query('SELECT * FROM audit_events WHERE resource_id = $1', [resourceId]);
    if (result.rows.length > 0) return result.rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Row for resource_id=${resourceId} not found within ${maxMs}ms`);
}

describe('PgApprovalAuditEmitter', () => {
  let emitter: PgApprovalAuditEmitter;
  beforeEach(() => { emitter = new PgApprovalAuditEmitter(pool as any); });

  it('inserts an approval audit event', async () => {
    const event: ApprovalAuditEvent = {
      type: 'approval_submitted', approvalId: 'apr-001',
      familyKey: 'app/proc/step', timestamp: '2026-03-16T12:00:00.000Z',
    };
    emitter.emit(event);
    const row = await waitForRow(pool, 'apr-001');
    expect(row.event_type).toBe('approval_submitted');
    expect(row.resource_type).toBe('approval');
  });

  it('defaults actor to system', async () => {
    emitter.emit({
      type: 'approval_submitted', approvalId: 'apr-sys',
      familyKey: 'app/proc/step', timestamp: '2026-03-16T12:00:00.000Z',
    });
    const row = await waitForRow(pool, 'apr-sys');
    expect(row.actor).toBe('system');
  });

  it('uses actor from event', async () => {
    emitter.emit({
      type: 'approval_approved', approvalId: 'apr-actor',
      familyKey: 'app/proc/step', actor: 'admin', reason: 'OK',
      timestamp: '2026-03-16T12:00:00.000Z',
    });
    const row = await waitForRow(pool, 'apr-actor');
    expect(row.actor).toBe('admin');
  });

  it('stores details as JSON', async () => {
    emitter.emit({
      type: 'approval_approved', approvalId: 'apr-det',
      familyKey: 'app/proc/step', actor: 'admin', reason: 'Looks good',
      timestamp: '2026-03-16T13:00:00.000Z',
    });
    const row = await waitForRow(pool, 'apr-det');
    const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    expect(details.familyKey).toBe('app/proc/step');
    expect(details.reason).toBe('Looks good');
  });
});

describe('PgRollbackAuditEmitter', () => {
  let emitter: PgRollbackAuditEmitter;
  beforeEach(() => { emitter = new PgRollbackAuditEmitter(pool as any); });

  it('inserts a rollback audit event', async () => {
    const event: RollbackAuditEvent = {
      type: 'rollback_executed', rollbackId: 'rb-001',
      familyKey: 'app/proc/step', targetAdaptationEventId: 'ae-100',
      actor: 'admin', reason: 'Regression', timestamp: '2026-03-16T12:00:00.000Z',
    };
    emitter.emit(event);
    const row = await waitForRow(pool, 'rb-001');
    expect(row.event_type).toBe('rollback_executed');
    expect(row.resource_type).toBe('rollback');
    expect(row.actor).toBe('admin');
  });

  it('stores targetAdaptationEventId in details', async () => {
    emitter.emit({
      type: 'rollback_executed', rollbackId: 'rb-det',
      familyKey: 'app/proc/step', targetAdaptationEventId: 'ae-200',
      actor: 'admin', reason: 'Regression', timestamp: '2026-03-16T12:00:00.000Z',
    });
    const row = await waitForRow(pool, 'rb-det');
    const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    expect(details.targetAdaptationEventId).toBe('ae-200');
  });
});
