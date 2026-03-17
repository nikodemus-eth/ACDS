// ---------------------------------------------------------------------------
// Integration Tests – PgAdaptationApprovalRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAdaptationApprovalRepository } from '@acds/persistence-pg';
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

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apr-001',
    familyKey: 'app/proc/step',
    recommendationId: 'rec-001',
    status: 'pending' as const,
    submittedAt: '2026-03-16T12:00:00.000Z',
    decidedAt: undefined,
    decidedBy: undefined,
    reason: undefined,
    expiresAt: '2026-03-17T12:00:00.000Z',
    ...overrides,
  };
}

describe('PgAdaptationApprovalRepository', () => {
  let repo: PgAdaptationApprovalRepository;

  beforeEach(() => {
    repo = new PgAdaptationApprovalRepository(pool as any);
  });

  // ── save() + findById() round-trip ────────────────────────────────────────

  describe('save() + findById()', () => {
    it('saves and retrieves an approval', async () => {
      const approval = makeApproval();
      await repo.save(approval);

      const result = await repo.findById('apr-001');
      expect(result).toBeDefined();
      expect(result!.id).toBe('apr-001');
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.recommendationId).toBe('rec-001');
      expect(result!.status).toBe('pending');
      expect(result!.submittedAt).toBe('2026-03-16T12:00:00.000Z');
      expect(result!.expiresAt).toBe('2026-03-17T12:00:00.000Z');
    });

    it('saves with all optional fields populated', async () => {
      const approval = makeApproval({
        status: 'approved',
        decidedAt: '2026-03-16T14:00:00.000Z',
        decidedBy: 'admin-user',
        reason: 'Looks good',
      });
      await repo.save(approval);

      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
      expect(result!.decidedAt).toBe('2026-03-16T14:00:00.000Z');
      expect(result!.decidedBy).toBe('admin-user');
      expect(result!.reason).toBe('Looks good');
    });

    it('upserts on conflict (updates existing)', async () => {
      await repo.save(makeApproval());
      await repo.save(makeApproval({ status: 'approved', reason: 'updated' }));

      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
      expect(result!.reason).toBe('updated');

      // Confirm only one row
      const count = await pool.query(
        "SELECT count(*)::int AS cnt FROM adaptation_approval_records WHERE id = $1",
        ['apr-001'],
      );
      expect(count.rows[0].cnt).toBe(1);
    });
  });

  // ── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns undefined for nonexistent id', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // ── findPending() ─────────────────────────────────────────────────────────

  describe('findPending()', () => {
    it('returns only pending approvals', async () => {
      await repo.save(makeApproval({ id: 'apr-1', status: 'pending' }));
      await repo.save(makeApproval({ id: 'apr-2', status: 'approved' }));
      await repo.save(makeApproval({ id: 'apr-3', status: 'pending' }));

      const results = await repo.findPending();
      expect(results).toHaveLength(2);
      results.forEach(r => expect(r.status).toBe('pending'));
    });

    it('returns empty array when no pending approvals', async () => {
      await repo.save(makeApproval({ id: 'apr-1', status: 'approved' }));

      const results = await repo.findPending();
      expect(results).toHaveLength(0);
    });
  });

  // ── findByFamily() ────────────────────────────────────────────────────────

  describe('findByFamily()', () => {
    it('returns approvals matching the family key', async () => {
      await repo.save(makeApproval({ id: 'apr-1', familyKey: 'app/proc/step' }));
      await repo.save(makeApproval({ id: 'apr-2', familyKey: 'other/family' }));
      await repo.save(makeApproval({ id: 'apr-3', familyKey: 'app/proc/step' }));

      const results = await repo.findByFamily('app/proc/step');
      expect(results).toHaveLength(2);
      results.forEach(r => expect(r.familyKey).toBe('app/proc/step'));
    });

    it('returns empty array when no match', async () => {
      const results = await repo.findByFamily('no/match');
      expect(results).toHaveLength(0);
    });
  });

  // ── updateStatus() ────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('updates the status', async () => {
      await repo.save(makeApproval());
      await repo.updateStatus('apr-001', 'approved');

      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
    });

    it('updates status with additional fields', async () => {
      await repo.save(makeApproval());
      await repo.updateStatus('apr-001', 'approved', {
        decidedAt: '2026-03-16T15:00:00.000Z',
        decidedBy: 'admin',
        reason: 'Approved after review',
      });

      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
      expect(result!.decidedAt).toBe('2026-03-16T15:00:00.000Z');
      expect(result!.decidedBy).toBe('admin');
      expect(result!.reason).toBe('Approved after review');
    });

    it('updates status with partial additional fields', async () => {
      await repo.save(makeApproval());
      await repo.updateStatus('apr-001', 'rejected', {
        reason: 'Too risky',
      });

      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('rejected');
      expect(result!.reason).toBe('Too risky');
    });

    it('throws when updating a nonexistent approval', async () => {
      await expect(
        repo.updateStatus('nonexistent', 'approved'),
      ).rejects.toThrow('Adaptation approval not found');
    });
  });
});
