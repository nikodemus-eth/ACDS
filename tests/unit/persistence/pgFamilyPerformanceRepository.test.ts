// ---------------------------------------------------------------------------
// Integration Tests – PgFamilyPerformanceRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgFamilyPerformanceRepository } from '@acds/persistence-pg';
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

/** Insert a family selection state row directly. */
async function insertFamilyState(
  pool: PoolLike,
  familyKey: string,
  rollingScore: number,
  recentTrend: string,
  lastAdaptationAt: string,
) {
  await pool.query(
    `INSERT INTO family_selection_states
       (family_key, current_candidate_id, rolling_score, exploration_rate, plateau_detected, last_adaptation_at, recent_trend)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (family_key) DO UPDATE SET
       rolling_score = EXCLUDED.rolling_score,
       recent_trend = EXCLUDED.recent_trend,
       last_adaptation_at = EXCLUDED.last_adaptation_at`,
    [familyKey, 'cand-default', rollingScore, 0.1, false, lastAdaptationAt, recentTrend],
  );
}

/** Insert a candidate performance state row directly. */
async function insertCandidateState(
  pool: PoolLike,
  candidateId: string,
  familyKey: string,
  runCount: number,
) {
  await pool.query(
    `INSERT INTO candidate_performance_states
       (candidate_id, family_key, rolling_score, run_count, success_rate, average_latency, last_selected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [candidateId, familyKey, 0.8, runCount, 0.9, 200, '2026-03-16T12:00:00.000Z'],
  );
}

describe('PgFamilyPerformanceRepository', () => {
  let repo: PgFamilyPerformanceRepository;

  beforeEach(() => {
    repo = new PgFamilyPerformanceRepository(pool as any);
  });

  // ── listAll() ─────────────────────────────────────────────────────────────

  describe('listAll()', () => {
    it('returns all family performance summaries', async () => {
      await insertFamilyState(pool, 'app/proc/step-a', 0.85, 'stable', '2026-03-16T12:00:00.000Z');
      await insertFamilyState(pool, 'app/proc/step-b', 0.90, 'improving', '2026-03-16T13:00:00.000Z');

      const results = await repo.listAll();
      expect(results).toHaveLength(2);
    });

    it('returns summaries ordered by family_key', async () => {
      await insertFamilyState(pool, 'z/family', 0.7, 'stable', '2026-03-16T12:00:00Z');
      await insertFamilyState(pool, 'a/family', 0.8, 'stable', '2026-03-16T12:00:00Z');

      const results = await repo.listAll();
      expect(results[0].familyKey).toBe('a/family');
      expect(results[1].familyKey).toBe('z/family');
    });

    it('aggregates run_count from candidate_performance_states', async () => {
      await insertFamilyState(pool, 'app/proc/step', 0.85, 'stable', '2026-03-16T12:00:00Z');
      await insertCandidateState(pool, 'cand-1', 'app/proc/step', 50);
      await insertCandidateState(pool, 'cand-2', 'app/proc/step', 30);

      const results = await repo.listAll();
      expect(results).toHaveLength(1);
      expect(results[0].runCount).toBe(80);
    });

    it('returns runCount 0 when no candidates exist', async () => {
      await insertFamilyState(pool, 'app/proc/step', 0.85, 'stable', '2026-03-16T12:00:00Z');

      const results = await repo.listAll();
      expect(results).toHaveLength(1);
      expect(results[0].runCount).toBe(0);
    });

    it('maps fields correctly', async () => {
      await insertFamilyState(pool, 'app/proc/step', 0.85, 'improving', '2026-03-16T12:00:00.000Z');

      const results = await repo.listAll();
      const summary = results[0];
      expect(summary.familyKey).toBe('app/proc/step');
      expect(summary.rollingScore).toBeCloseTo(0.85);
      expect(summary.metricTrends).toEqual([]);
      expect(summary.recentFailureCount).toBe(0);
      expect(summary.lastUpdated).toBeInstanceOf(Date);
    });

    it('returns empty array when no families exist', async () => {
      const results = await repo.listAll();
      expect(results).toHaveLength(0);
    });
  });

  // ── getByFamilyKey() ──────────────────────────────────────────────────────

  describe('getByFamilyKey()', () => {
    it('returns the summary for a specific family key', async () => {
      await insertFamilyState(pool, 'app/proc/step', 0.85, 'stable', '2026-03-16T12:00:00Z');
      await insertCandidateState(pool, 'cand-1', 'app/proc/step', 100);

      const result = await repo.getByFamilyKey('app/proc/step');
      expect(result).not.toBeNull();
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.rollingScore).toBeCloseTo(0.85);
      expect(result!.runCount).toBe(100);
    });

    it('returns null for nonexistent family key', async () => {
      const result = await repo.getByFamilyKey('nonexistent');
      expect(result).toBeNull();
    });

    it('does not include candidates from other families', async () => {
      await insertFamilyState(pool, 'fam-a', 0.85, 'stable', '2026-03-16T12:00:00Z');
      await insertFamilyState(pool, 'fam-b', 0.90, 'stable', '2026-03-16T12:00:00Z');
      await insertCandidateState(pool, 'cand-1', 'fam-a', 50);
      await insertCandidateState(pool, 'cand-2', 'fam-b', 100);

      const result = await repo.getByFamilyKey('fam-a');
      expect(result!.runCount).toBe(50);
    });
  });
});
