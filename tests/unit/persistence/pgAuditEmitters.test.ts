// ---------------------------------------------------------------------------
// Unit Tests – PgApprovalAuditEmitter & PgRollbackAuditEmitter
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PgApprovalAuditEmitter, PgRollbackAuditEmitter } from '@acds/persistence-pg';
import type { ApprovalAuditEvent, RollbackAuditEvent } from '@acds/adaptive-optimizer';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

// ── PgApprovalAuditEmitter ────────────────────────────────────────────────

describe('PgApprovalAuditEmitter', () => {
  let pool: ReturnType<typeof createMockPool>;
  let emitter: PgApprovalAuditEmitter;

  beforeEach(() => {
    pool = createMockPool();
    emitter = new PgApprovalAuditEmitter(pool as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts an approval audit event into audit_events table', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event: ApprovalAuditEvent = {
      type: 'approval_submitted',
      approvalId: 'apr-001',
      familyKey: 'app/proc/step',
      timestamp: '2026-03-16T12:00:00.000Z',
    };

    emitter.emit(event);

    // emit() is fire-and-forget, wait for the internal promise
    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(1));

    const call = pool.query.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO audit_events');
    const params = call[1];
    expect(params[0]).toBe('approval_submitted'); // event_type
    expect(params[1]).toBe('system'); // actor defaults to 'system' when undefined
    expect(params[2]).toBe('approval_submitted'); // action
    expect(params[3]).toBe('approval'); // resource_type
    expect(params[4]).toBe('apr-001'); // resource_id
  });

  it('uses the actor from the event when provided', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event: ApprovalAuditEvent = {
      type: 'approval_approved',
      approvalId: 'apr-002',
      familyKey: 'app/proc/step',
      actor: 'admin@example.com',
      reason: 'Looks good',
      timestamp: '2026-03-16T13:00:00.000Z',
    };

    emitter.emit(event);

    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(1));

    const params = pool.query.mock.calls[0][1];
    expect(params[1]).toBe('admin@example.com');
    const details = JSON.parse(params[5]);
    expect(details.reason).toBe('Looks good');
    expect(details.familyKey).toBe('app/proc/step');
  });

  it('does not throw on database error (fire-and-forget)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('DB down'));

    emitter.emit({
      type: 'approval_rejected',
      approvalId: 'apr-003',
      familyKey: 'app/proc/step',
      timestamp: '2026-03-16T14:00:00.000Z',
    });

    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(consoleSpy.mock.calls[0][0]).toContain('[approval-audit]');
  });

  it('handles all approval event types', async () => {
    const types: ApprovalAuditEvent['type'][] = [
      'approval_submitted',
      'approval_approved',
      'approval_rejected',
      'approval_expired',
    ];

    for (const type of types) {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      emitter.emit({
        type,
        approvalId: `apr-${type}`,
        familyKey: 'app/proc/step',
        timestamp: '2026-03-16T15:00:00.000Z',
      });
    }

    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(4));
  });
});

// ── PgRollbackAuditEmitter ────────────────────────────────────────────────

describe('PgRollbackAuditEmitter', () => {
  let pool: ReturnType<typeof createMockPool>;
  let emitter: PgRollbackAuditEmitter;

  beforeEach(() => {
    pool = createMockPool();
    emitter = new PgRollbackAuditEmitter(pool as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a rollback audit event into audit_events table', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

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

    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(1));

    const call = pool.query.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO audit_events');
    const params = call[1];
    expect(params[0]).toBe('rollback_executed');
    expect(params[1]).toBe('admin@example.com');
    expect(params[3]).toBe('rollback');
    expect(params[4]).toBe('rb-001');

    const details = JSON.parse(params[5]);
    expect(details.targetAdaptationEventId).toBe('ae-100');
    expect(details.reason).toBe('Performance regression');
  });

  it('handles rollback_previewed event type', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    emitter.emit({
      type: 'rollback_previewed',
      rollbackId: 'rb-002',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'ae-200',
      actor: 'viewer@example.com',
      reason: 'Checking impact',
      timestamp: '2026-03-16T13:00:00.000Z',
    });

    await vi.waitFor(() => expect(pool.query).toHaveBeenCalledTimes(1));
    expect(pool.query.mock.calls[0][1][0]).toBe('rollback_previewed');
  });

  it('does not throw on database error (fire-and-forget)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('timeout'));

    emitter.emit({
      type: 'rollback_executed',
      rollbackId: 'rb-003',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'ae-300',
      actor: 'admin',
      reason: 'Emergency',
      timestamp: '2026-03-16T14:00:00.000Z',
    });

    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(consoleSpy.mock.calls[0][0]).toContain('[rollback-audit]');
  });
});
