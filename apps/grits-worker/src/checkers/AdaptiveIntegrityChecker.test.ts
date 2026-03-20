import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AdaptiveIntegrityChecker } from './AdaptiveIntegrityChecker.js';
import { PgProviderRepository, PgOptimizerStateRepository, PgAdaptationApprovalRepository, PgAdaptationEventRepository } from '@acds/persistence-pg';
import { PgAdaptationRollbackReadRepository } from '../repositories/PgAdaptationRollbackReadRepository.js';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let providerRepo: PgProviderRepository;
let optimizerRepo: PgOptimizerStateRepository;
let approvalRepo: PgAdaptationApprovalRepository;
let ledger: PgAdaptationEventRepository;
let rollbackRepo: PgAdaptationRollbackReadRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  providerRepo = new PgProviderRepository(pool as any);
  optimizerRepo = new PgOptimizerStateRepository(pool as any);
  approvalRepo = new PgAdaptationApprovalRepository(pool as any);
  ledger = new PgAdaptationEventRepository(pool as any);
  rollbackRepo = new PgAdaptationRollbackReadRepository(pool as any);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

async function seedProvider(id: string, enabled = true) {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'TestProvider', ProviderVendor.OPENAI, AuthType.API_KEY, 'https://api.openai.com', enabled, 'cloud'],
  );
}

describe('AdaptiveIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo);
    expect(checker.name).toBe('AdaptiveIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-003', 'INV-004']);
    expect(checker.supportedCadences).toContain('fast');
    expect(checker.supportedCadences).toContain('daily');
    expect(checker.supportedCadences).toContain('release');
  });

  describe('INV-003: Adaptive selection eligibility', () => {
    it('passes when no families exist', async () => {
      const checker = new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-003')!;
      expect(inv.status).toBe('pass');
      expect(inv.sampleSize).toBe(0);
    });
  });

  describe('INV-004: Approval/rollback state machines', () => {
    it('passes when no families exist', async () => {
      const checker = new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-004')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('cadence variations', () => {
    it('returns correct cadence in result', async () => {
      const checker = new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo);
      const fast = await checker.check('fast');
      expect(fast.cadence).toBe('fast');

      const release = await checker.check('release');
      expect(release.cadence).toBe('release');
    });
  });
});
