// ---------------------------------------------------------------------------
// Integration Tests – PgOptimizerStateRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgOptimizerStateRepository } from '@acds/persistence-pg';
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

function makeFamilyState(overrides: Record<string, unknown> = {}) {
  return {
    familyKey: 'app/proc/step',
    currentCandidateId: 'cand-001',
    rollingScore: 0.85,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: '2026-03-16T12:00:00.000Z',
    recentTrend: 'stable' as const,
    ...overrides,
  };
}

function makeCandidateState(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'cand-001',
    familyKey: 'app/proc/step',
    rollingScore: 0.9,
    runCount: 100,
    successRate: 0.95,
    averageLatency: 250,
    lastSelectedAt: '2026-03-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('PgOptimizerStateRepository', () => {
  let repo: PgOptimizerStateRepository;

  beforeEach(() => {
    repo = new PgOptimizerStateRepository(pool as any);
  });

  // ── getFamilyState() + saveFamilyState() ──────────────────────────────────

  describe('getFamilyState() + saveFamilyState()', () => {
    it('saves and retrieves a family state', async () => {
      await repo.saveFamilyState(makeFamilyState());

      const result = await repo.getFamilyState('app/proc/step');
      expect(result).toBeDefined();
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.currentCandidateId).toBe('cand-001');
      expect(result!.rollingScore).toBeCloseTo(0.85);
      expect(result!.explorationRate).toBeCloseTo(0.1);
      expect(result!.plateauDetected).toBe(false);
      expect(result!.lastAdaptationAt).toBe('2026-03-16T12:00:00.000Z');
      expect(result!.recentTrend).toBe('stable');
    });

    it('returns undefined for nonexistent family key', async () => {
      const result = await repo.getFamilyState('nonexistent');
      expect(result).toBeUndefined();
    });

    it('upserts on conflict (updates existing)', async () => {
      await repo.saveFamilyState(makeFamilyState());
      await repo.saveFamilyState(makeFamilyState({
        currentCandidateId: 'cand-002',
        rollingScore: 0.92,
        recentTrend: 'improving',
      }));

      const result = await repo.getFamilyState('app/proc/step');
      expect(result!.currentCandidateId).toBe('cand-002');
      expect(result!.rollingScore).toBeCloseTo(0.92);
      expect(result!.recentTrend).toBe('improving');
    });

    it('handles plateau_detected = true', async () => {
      await repo.saveFamilyState(makeFamilyState({ plateauDetected: true }));

      const result = await repo.getFamilyState('app/proc/step');
      expect(result!.plateauDetected).toBe(true);
    });

    it('handles declining trend', async () => {
      await repo.saveFamilyState(makeFamilyState({ recentTrend: 'declining' }));

      const result = await repo.getFamilyState('app/proc/step');
      expect(result!.recentTrend).toBe('declining');
    });
  });

  // ── getCandidateStates() + saveCandidateState() ───────────────────────────

  describe('getCandidateStates() + saveCandidateState()', () => {
    it('saves and retrieves candidate states for a family', async () => {
      await repo.saveCandidateState(makeCandidateState({ candidateId: 'cand-001', rollingScore: 0.9 }));
      await repo.saveCandidateState(makeCandidateState({ candidateId: 'cand-002', rollingScore: 0.8 }));

      const results = await repo.getCandidateStates('app/proc/step');
      expect(results).toHaveLength(2);
      // Ordered by rolling_score DESC
      expect(results[0].candidateId).toBe('cand-001');
      expect(results[0].rollingScore).toBeCloseTo(0.9);
      expect(results[1].candidateId).toBe('cand-002');
      expect(results[1].rollingScore).toBeCloseTo(0.8);
    });

    it('returns empty array when no candidates exist', async () => {
      const results = await repo.getCandidateStates('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('upserts on conflict (updates existing candidate)', async () => {
      await repo.saveCandidateState(makeCandidateState());
      await repo.saveCandidateState(makeCandidateState({
        rollingScore: 0.95,
        runCount: 150,
        successRate: 0.98,
      }));

      const results = await repo.getCandidateStates('app/proc/step');
      expect(results).toHaveLength(1);
      expect(results[0].rollingScore).toBeCloseTo(0.95);
      expect(results[0].runCount).toBe(150);
      expect(results[0].successRate).toBeCloseTo(0.98);
    });

    it('maps all fields correctly', async () => {
      await repo.saveCandidateState(makeCandidateState());

      const results = await repo.getCandidateStates('app/proc/step');
      expect(results).toHaveLength(1);
      const c = results[0];
      expect(c.candidateId).toBe('cand-001');
      expect(c.familyKey).toBe('app/proc/step');
      expect(c.rollingScore).toBeCloseTo(0.9);
      expect(c.runCount).toBe(100);
      expect(c.successRate).toBeCloseTo(0.95);
      expect(c.averageLatency).toBeCloseTo(250);
      expect(c.lastSelectedAt).toBe('2026-03-16T12:00:00.000Z');
    });

    it('only returns candidates for the specified family', async () => {
      await repo.saveCandidateState(makeCandidateState({ familyKey: 'fam-a' }));
      await repo.saveCandidateState(makeCandidateState({
        candidateId: 'cand-002',
        familyKey: 'fam-b',
      }));

      const resultsA = await repo.getCandidateStates('fam-a');
      expect(resultsA).toHaveLength(1);
      expect(resultsA[0].familyKey).toBe('fam-a');

      const resultsB = await repo.getCandidateStates('fam-b');
      expect(resultsB).toHaveLength(1);
      expect(resultsB[0].familyKey).toBe('fam-b');
    });
  });

  // ── listFamilies() ────────────────────────────────────────────────────────

  describe('listFamilies()', () => {
    it('returns all family keys ordered alphabetically', async () => {
      await repo.saveFamilyState(makeFamilyState({ familyKey: 'c/family' }));
      await repo.saveFamilyState(makeFamilyState({ familyKey: 'a/family' }));
      await repo.saveFamilyState(makeFamilyState({ familyKey: 'b/family' }));

      const results = await repo.listFamilies();
      expect(results).toEqual(['a/family', 'b/family', 'c/family']);
    });

    it('returns empty array when no families exist', async () => {
      const results = await repo.listFamilies();
      expect(results).toHaveLength(0);
    });
  });
});
