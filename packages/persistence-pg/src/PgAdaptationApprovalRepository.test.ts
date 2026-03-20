// Integration Tests – PgAdaptationApprovalRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAdaptationApprovalRepository } from './PgAdaptationApprovalRepository.js';
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

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apr-001', familyKey: 'app/proc/step', recommendationId: 'rec-001',
    status: 'pending' as const, submittedAt: '2026-03-16T12:00:00.000Z',
    decidedAt: undefined, decidedBy: undefined, reason: undefined,
    expiresAt: '2026-03-17T12:00:00.000Z', ...overrides,
  };
}

describe('PgAdaptationApprovalRepository', () => {
  let repo: PgAdaptationApprovalRepository;
  beforeEach(() => { repo = new PgAdaptationApprovalRepository(pool as any); });

  describe('save() + findById()', () => {
    it('saves and retrieves an approval', async () => {
      await repo.save(makeApproval());
      const result = await repo.findById('apr-001');
      expect(result).toBeDefined();
      expect(result!.id).toBe('apr-001');
      expect(result!.status).toBe('pending');
    });

    it('saves with all optional fields', async () => {
      await repo.save(makeApproval({
        status: 'approved', decidedAt: '2026-03-16T14:00:00.000Z',
        decidedBy: 'admin', reason: 'Looks good',
      }));
      const result = await repo.findById('apr-001');
      expect(result!.decidedBy).toBe('admin');
    });

    it('upserts on conflict', async () => {
      await repo.save(makeApproval());
      await repo.save(makeApproval({ status: 'approved', reason: 'updated' }));
      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
    });
  });

  describe('findById()', () => {
    it('returns undefined for nonexistent', async () => {
      expect(await repo.findById('nope')).toBeUndefined();
    });
  });

  describe('findPending()', () => {
    it('returns only pending', async () => {
      await repo.save(makeApproval({ id: 'a1', status: 'pending' }));
      await repo.save(makeApproval({ id: 'a2', status: 'approved' }));
      const results = await repo.findPending();
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('pending');
    });
  });

  describe('findByFamily()', () => {
    it('returns matching family', async () => {
      await repo.save(makeApproval({ id: 'a1', familyKey: 'app/proc/step' }));
      await repo.save(makeApproval({ id: 'a2', familyKey: 'other' }));
      const results = await repo.findByFamily('app/proc/step');
      expect(results).toHaveLength(1);
    });
  });

  describe('updateStatus()', () => {
    it('updates status', async () => {
      await repo.save(makeApproval());
      await repo.updateStatus('apr-001', 'approved');
      const result = await repo.findById('apr-001');
      expect(result!.status).toBe('approved');
    });

    it('updates status with additional fields', async () => {
      await repo.save(makeApproval());
      await repo.updateStatus('apr-001', 'approved', {
        decidedAt: '2026-03-16T15:00:00.000Z', decidedBy: 'admin', reason: 'OK',
      });
      const result = await repo.findById('apr-001');
      expect(result!.decidedBy).toBe('admin');
    });

    it('throws for nonexistent approval', async () => {
      await expect(repo.updateStatus('nope', 'approved')).rejects.toThrow('Adaptation approval not found');
    });
  });
});
