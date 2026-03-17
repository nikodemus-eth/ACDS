// ---------------------------------------------------------------------------
// Integration Tests – PgApprovalAuditEmitter & PgRollbackAuditEmitter (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgApprovalAuditEmitter, PgRollbackAuditEmitter } from '@acds/persistence-pg';
import type { ApprovalAuditEvent, RollbackAuditEvent } from '@acds/adaptive-optimizer';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForRow(
  pool: PoolLike,
  resourceId: string,
  maxMs = 2000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await pool.query(
      'SELECT * FROM audit_events WHERE resource_id = $1',
      [resourceId],
    );
    if (result.rows.length > 0) return result.rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Row for resource_id=${resourceId} not found within ${maxMs}ms`);
}

// ── Console capture (no vi.spyOn) ───────────────────────────────────────────

let capturedErrors: string[] = [];
const originalError = console.error;

// ── PgApprovalAuditEmitter ──────────────────────────────────────────────────

describe('PgApprovalAuditEmitter', () => {
  let emitter: PgApprovalAuditEmitter;

  beforeEach(() => {
    emitter = new PgApprovalAuditEmitter(pool as any);
  });

  it('inserts an approval audit event and the row is readable', async () => {
    const event: ApprovalAuditEvent = {
      type: 'approval_submitted',
      approvalId: 'apr-001',
      familyKey: 'app/proc/step',
      timestamp: '2026-03-16T12:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'apr-001');
    expect(row.event_type).toBe('approval_submitted');
    expect(row.action).toBe('approval_submitted');
    expect(row.resource_type).toBe('approval');
    expect(row.resource_id).toBe('apr-001');
  });

  it('defaults actor to "system" when not provided', async () => {
    const event: ApprovalAuditEvent = {
      type: 'approval_submitted',
      approvalId: 'apr-sys',
      familyKey: 'app/proc/step',
      timestamp: '2026-03-16T12:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'apr-sys');
    expect(row.actor).toBe('system');
  });

  it('uses the actor from the event when provided', async () => {
    const event: ApprovalAuditEvent = {
      type: 'approval_approved',
      approvalId: 'apr-actor',
      familyKey: 'app/proc/step',
      actor: 'admin@example.com',
      reason: 'Looks good',
      timestamp: '2026-03-16T13:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'apr-actor');
    expect(row.actor).toBe('admin@example.com');
  });

  it('stores details as JSON with familyKey, reason, and timestamp', async () => {
    const event: ApprovalAuditEvent = {
      type: 'approval_approved',
      approvalId: 'apr-det',
      familyKey: 'app/proc/step',
      actor: 'admin@example.com',
      reason: 'Looks good',
      timestamp: '2026-03-16T13:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'apr-det');
    const details =
      typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    expect(details.familyKey).toBe('app/proc/step');
    expect(details.reason).toBe('Looks good');
    expect(details.timestamp).toBe('2026-03-16T13:00:00.000Z');
  });

  it('handles all approval event types', async () => {
    const types: ApprovalAuditEvent['type'][] = [
      'approval_submitted',
      'approval_approved',
      'approval_rejected',
      'approval_expired',
    ];

    for (const type of types) {
      emitter.emit({
        type,
        approvalId: `apr-${type}`,
        familyKey: 'app/proc/step',
        timestamp: '2026-03-16T15:00:00.000Z',
      });
    }

    // Wait for all rows
    for (const type of types) {
      const row = await waitForRow(pool, `apr-${type}`);
      expect(row.event_type).toBe(type);
    }
  });

  it('does not throw on database error (fire-and-forget)', async () => {
    capturedErrors = [];
    console.error = (...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(' '));
    };

    try {
      // Drop the table so the INSERT fails
      await pool.query('DROP TABLE audit_events CASCADE');

      const event: ApprovalAuditEvent = {
        type: 'approval_rejected',
        approvalId: 'apr-err',
        familyKey: 'app/proc/step',
        timestamp: '2026-03-16T14:00:00.000Z',
      };

      // Should not throw
      emitter.emit(event);

      // Wait for the error to be caught and logged
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && capturedErrors.length === 0) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(capturedErrors.length).toBeGreaterThan(0);
      expect(capturedErrors[0]).toContain('[approval-audit]');
    } finally {
      console.error = originalError;
      // Recreate the audit_events table only (not full migrations which would fail on existing tables)
      await pool.execSQL(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type      VARCHAR     NOT NULL,
          actor           VARCHAR,
          action          VARCHAR     NOT NULL,
          resource_type   VARCHAR,
          resource_id     VARCHAR,
          application     VARCHAR,
          details         JSONB,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_events_application ON audit_events(application);
        CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
      `);
    }
  });
});

// ── PgRollbackAuditEmitter ──────────────────────────────────────────────────

describe('PgRollbackAuditEmitter', () => {
  let emitter: PgRollbackAuditEmitter;

  beforeEach(() => {
    emitter = new PgRollbackAuditEmitter(pool as any);
  });

  it('inserts a rollback audit event and the row is readable', async () => {
    const event: RollbackAuditEvent = {
      type: 'rollback_executed',
      rollbackId: 'rb-001',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'ae-100',
      actor: 'admin@example.com',
      reason: 'Performance regression',
      timestamp: '2026-03-16T12:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'rb-001');
    expect(row.event_type).toBe('rollback_executed');
    expect(row.actor).toBe('admin@example.com');
    expect(row.resource_type).toBe('rollback');
    expect(row.resource_id).toBe('rb-001');
  });

  it('stores targetAdaptationEventId and reason in details JSON', async () => {
    const event: RollbackAuditEvent = {
      type: 'rollback_executed',
      rollbackId: 'rb-det',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'ae-200',
      actor: 'admin@example.com',
      reason: 'Performance regression',
      timestamp: '2026-03-16T12:00:00.000Z',
    };

    emitter.emit(event);

    const row = await waitForRow(pool, 'rb-det');
    const details =
      typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    expect(details.targetAdaptationEventId).toBe('ae-200');
    expect(details.reason).toBe('Performance regression');
    expect(details.familyKey).toBe('app/proc/step');
  });

  it('handles rollback_previewed event type', async () => {
    emitter.emit({
      type: 'rollback_previewed',
      rollbackId: 'rb-preview',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'ae-300',
      actor: 'viewer@example.com',
      reason: 'Checking impact',
      timestamp: '2026-03-16T13:00:00.000Z',
    });

    const row = await waitForRow(pool, 'rb-preview');
    expect(row.event_type).toBe('rollback_previewed');
  });

  it('does not throw on database error (fire-and-forget)', async () => {
    capturedErrors = [];
    console.error = (...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(' '));
    };

    try {
      // Drop the table so the INSERT fails
      await pool.query('DROP TABLE audit_events CASCADE');

      emitter.emit({
        type: 'rollback_executed',
        rollbackId: 'rb-err',
        familyKey: 'app/proc/step',
        targetAdaptationEventId: 'ae-fail',
        actor: 'admin',
        reason: 'Emergency',
        timestamp: '2026-03-16T14:00:00.000Z',
      });

      // Wait for the error to be caught and logged
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && capturedErrors.length === 0) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(capturedErrors.length).toBeGreaterThan(0);
      expect(capturedErrors[0]).toContain('[rollback-audit]');
    } finally {
      console.error = originalError;
      // Recreate the audit_events table only
      await pool.execSQL(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type      VARCHAR     NOT NULL,
          actor           VARCHAR,
          action          VARCHAR     NOT NULL,
          resource_type   VARCHAR,
          resource_id     VARCHAR,
          application     VARCHAR,
          details         JSONB,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_events_application ON audit_events(application);
        CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
      `);
    }
  });
});
