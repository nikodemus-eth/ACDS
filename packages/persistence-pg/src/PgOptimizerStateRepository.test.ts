// Integration Tests – PgOptimizerStateRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgOptimizerStateRepository } from './PgOptimizerStateRepository.js';
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

function makeFamilyState(overrides: Record<string, unknown> = {}) {
  return {
    familyKey: 'app/proc/step', currentCandidateId: 'cand-001',
    rollingScore: 0.85, explorationRate: 0.1, plateauDetected: false,
    lastAdaptationAt: '2026-03-16T12:00:00.000Z', recentTrend: 'stable' as const,
    ...overrides,
  };
}

function makeCandidateState(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'cand-001', familyKey: 'app/proc/step', rollingScore: 0.9,
    runCount: 100, successRate: 0.95, averageLatency: 250,
    lastSelectedAt: '2026-03-16T12:00:00.000Z', ...overrides,
  };
}

describe('PgOptimizerStateRepository', () => {
  let repo: PgOptimizerStateRepository;
  beforeEach(() => { repo = new PgOptimizerStateRepository(pool as any); });

  describe('family state', () => {
    it('saves and retrieves', async () => {
      await repo.saveFamilyState(makeFamilyState());
      const result = await repo.getFamilyState('app/proc/step');
      expect(result).toBeDefined();
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.rollingScore).toBeCloseTo(0.85);
      expect(result!.recentTrend).toBe('stable');
    });

    it('returns undefined for nonexistent', async () => {
      expect(await repo.getFamilyState('nope')).toBeUndefined();
    });

    it('upserts on conflict', async () => {
      await repo.saveFamilyState(makeFamilyState());
      await repo.saveFamilyState(makeFamilyState({ rollingScore: 0.92, recentTrend: 'improving' }));
      const result = await repo.getFamilyState('app/proc/step');
      expect(result!.rollingScore).toBeCloseTo(0.92);
      expect(result!.recentTrend).toBe('improving');
    });
  });

  describe('candidate state', () => {
    it('saves and retrieves ordered by rolling_score DESC', async () => {
      await repo.saveCandidateState(makeCandidateState({ candidateId: 'c1', rollingScore: 0.9 }));
      await repo.saveCandidateState(makeCandidateState({ candidateId: 'c2', rollingScore: 0.8 }));
      const results = await repo.getCandidateStates('app/proc/step');
      expect(results).toHaveLength(2);
      expect(results[0].candidateId).toBe('c1');
    });

    it('returns empty for nonexistent family', async () => {
      expect(await repo.getCandidateStates('nope')).toHaveLength(0);
    });

    it('upserts on conflict', async () => {
      await repo.saveCandidateState(makeCandidateState());
      await repo.saveCandidateState(makeCandidateState({ rollingScore: 0.95, runCount: 150 }));
      const results = await repo.getCandidateStates('app/proc/step');
      expect(results).toHaveLength(1);
      expect(results[0].rollingScore).toBeCloseTo(0.95);
    });
  });

  describe('listFamilies()', () => {
    it('returns all family keys ordered', async () => {
      await repo.saveFamilyState(makeFamilyState({ familyKey: 'c' }));
      await repo.saveFamilyState(makeFamilyState({ familyKey: 'a' }));
      expect(await repo.listFamilies()).toEqual(['a', 'c']);
    });

    it('returns empty when none exist', async () => {
      expect(await repo.listFamilies()).toHaveLength(0);
    });
  });
});
