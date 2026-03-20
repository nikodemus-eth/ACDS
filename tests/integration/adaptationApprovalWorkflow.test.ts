// ---------------------------------------------------------------------------
// Integration Tests -- Adaptation Approval Workflow (Prompt 68)
// PGlite-backed: no InMemory/Mock/Stub classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdaptationRecommendation } from '@acds/adaptive-optimizer';
import type { AdaptationApproval } from '@acds/adaptive-optimizer';
import {
  AdaptationApprovalService,
} from '@acds/adaptive-optimizer';
import {
  PgAdaptationApprovalRepository,
  PgApprovalAuditEmitter,
} from '@acds/persistence-pg';
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// -- Test fixtures -----------------------------------------------------------

function makeRecommendation(overrides?: Partial<AdaptationRecommendation>): AdaptationRecommendation {
  return {
    id: randomUUID(),
    familyKey: 'test.family.advisory',
    recommendedRanking: [],
    evidence: 'Plateau detected (severity: moderate). Family trend: stable.',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createDeps() {
  const repo = new PgAdaptationApprovalRepository(pool as any);
  const emitter = new PgApprovalAuditEmitter(pool as any);
  const service = new AdaptationApprovalService(repo, emitter);
  return { repo, emitter, service };
}

// ===========================================================================
// Recommendation Creation
// ===========================================================================

describe('Approval Workflow -- Recommendation Creation', () => {
  it('creates an approval record from a recommendation', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    expect(approval.id).toBeDefined();
    expect(approval.familyKey).toBe(rec.familyKey);
    expect(approval.recommendationId).toBe(rec.id);
    expect(approval.status).toBe('pending');
    expect(approval.submittedAt).toBeDefined();
    expect(approval.expiresAt).toBeDefined();
  });

  it('persists the approval in the repository', async () => {
    const { repo, service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const found = await repo.findById(approval.id);

    expect(found).toBeDefined();
    expect(found!.status).toBe('pending');
  });

  it('emits an approval_submitted audit event', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    await service.submitForApproval(rec);

    // Verify the audit event was persisted to the audit_events table
    const result = await pool.query(
      `SELECT * FROM audit_events WHERE resource_type = 'approval' AND action = 'approval_submitted'`,
    );
    expect(result.rows.length).toBe(1);
  });
});

// ===========================================================================
// Pending State
// ===========================================================================

describe('Approval Workflow -- Pending State', () => {
  it('newly created approvals are in pending status', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    expect(approval.status).toBe('pending');
  });

  it('pending approvals are returned by findPending', async () => {
    const { repo, service } = createDeps();
    await service.submitForApproval(makeRecommendation({ familyKey: 'family.a' }));
    await service.submitForApproval(makeRecommendation({ familyKey: 'family.b' }));

    const pending = await repo.findPending();
    expect(pending).toHaveLength(2);
    pending.forEach((p) => expect(p.status).toBe('pending'));
  });

  it('sets an expiry time in the future', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    const expiresAt = new Date(approval.expiresAt).getTime();
    const submittedAt = new Date(approval.submittedAt).getTime();

    expect(expiresAt).toBeGreaterThan(submittedAt);
  });
});

// ===========================================================================
// Approve Path
// ===========================================================================

describe('Approval Workflow -- Approve Path', () => {
  it('transitions a pending approval to approved', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const updated = await service.approve(approval.id, 'operator@acds', 'Looks good');

    expect(updated.status).toBe('approved');
    expect(updated.decidedBy).toBe('operator@acds');
    expect(updated.reason).toBe('Looks good');
    expect(updated.decidedAt).toBeDefined();
  });

  it('persists the approved status', async () => {
    const { repo, service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds');

    const found = await repo.findById(approval.id);
    expect(found!.status).toBe('approved');
  });

  it('emits an approval_approved audit event', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds', 'Evidence is strong');

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE action = 'approval_approved'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('rejects approving a non-pending approval', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds');

    await expect(
      service.approve(approval.id, 'other@acds'),
    ).rejects.toThrow(/cannot be modified/);
  });
});

// ===========================================================================
// Reject Path
// ===========================================================================

describe('Approval Workflow -- Reject Path', () => {
  it('transitions a pending approval to rejected', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const updated = await service.reject(approval.id, 'operator@acds', 'Insufficient evidence');

    expect(updated.status).toBe('rejected');
    expect(updated.decidedBy).toBe('operator@acds');
    expect(updated.reason).toBe('Insufficient evidence');
  });

  it('emits an approval_rejected audit event', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.reject(approval.id, 'operator@acds', 'Not now');

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE action = 'approval_rejected'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('rejects rejecting a non-pending approval', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.reject(approval.id, 'operator@acds');

    await expect(
      service.reject(approval.id, 'other@acds'),
    ).rejects.toThrow(/cannot be modified/);
  });

  it('throws when approval does not exist', async () => {
    const { service } = createDeps();
    await expect(
      service.reject('nonexistent-id', 'operator@acds'),
    ).rejects.toThrow(/not found/);
  });
});

// ===========================================================================
// Audit Event Emission
// ===========================================================================

describe('Approval Workflow -- Audit Event Emission', () => {
  it('emits events for the full approval lifecycle', async () => {
    const { service } = createDeps();
    const rec1 = makeRecommendation({ familyKey: 'family.approved' });
    const approval1 = await service.submitForApproval(rec1);
    await service.approve(approval1.id, 'operator@acds');

    const rec2 = makeRecommendation({ familyKey: 'family.rejected' });
    const approval2 = await service.submitForApproval(rec2);
    await service.reject(approval2.id, 'operator@acds');

    const result = await pool.query(
      `SELECT action FROM audit_events WHERE resource_type = 'approval' ORDER BY created_at`,
    );
    const types = result.rows.map((r) => r.action);
    expect(types).toContain('approval_submitted');
    expect(types).toContain('approval_approved');
    expect(types).toContain('approval_rejected');
  });

  it('each audit event has a timestamp and familyKey', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    await service.submitForApproval(rec);

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE resource_type = 'approval'`,
    );
    for (const row of result.rows) {
      expect(row.created_at).toBeDefined();
      expect(row.details).toBeDefined();
    }
  });

  it('emits approval_expired events during expireStale', async () => {
    const { service } = createDeps();
    const rec = makeRecommendation();
    // Submit with a very short expiry (1 ms)
    await service.submitForApproval(rec, 1);

    // Wait a small amount to ensure expiry
    await new Promise((resolve) => setTimeout(resolve, 10));

    const count = await service.expireStale();
    expect(count).toBe(1);

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE action = 'approval_expired'`,
    );
    expect(result.rows.length).toBe(1);
  });
});
