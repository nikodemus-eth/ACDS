// Integration Tests – PgAdaptationEventRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAdaptationEventRepository, PgAdaptationRecommendationRepository } from './PgAdaptationEventRepository.js';
import type { AdaptationEvent, RankedCandidate } from '@acds/adaptive-optimizer';
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

function makeRankedCandidate(id: string, rank: number, score: number): RankedCandidate {
  return {
    candidate: {
      candidateId: id, familyKey: 'app/proc/step', rollingScore: score,
      runCount: 10, successRate: score, averageLatency: 250, lastSelectedAt: '2026-03-16T10:00:00.000Z',
    },
    rank, compositeScore: score,
    scoreBreakdown: { performanceComponent: score, recencyComponent: 0.5, successRateComponent: score },
  };
}

function makeEvent(overrides: Partial<AdaptationEvent> = {}): AdaptationEvent {
  return {
    id: 'ae-001', familyKey: 'app/proc/step',
    previousRanking: [makeRankedCandidate('cand-a', 1, 0.9)],
    newRanking: [makeRankedCandidate('cand-b', 1, 0.95)],
    trigger: 'scheduled', evidenceSummary: 'Score improvement',
    mode: 'auto_apply_low_risk',
    policyBoundsSnapshot: { explorationRate: 0.1, mode: 'auto_apply_low_risk', additionalConstraints: {} },
    createdAt: '2026-03-16T12:00:00.000Z', ...overrides,
  };
}

describe('PgAdaptationEventRepository', () => {
  let repo: PgAdaptationEventRepository;
  beforeEach(() => { repo = new PgAdaptationEventRepository(pool as any); });

  describe('writeEvent + getEvent', () => {
    it('round-trips an event', async () => {
      await repo.writeEvent(makeEvent());
      const result = await repo.getEvent('ae-001');
      expect(result).toBeDefined();
      expect(result!.id).toBe('ae-001');
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.evidenceSummary).toBe('Score improvement');
    });
  });

  describe('getEvent()', () => {
    it('returns undefined for missing id', async () => {
      expect(await repo.getEvent('nope')).toBeUndefined();
    });
  });

  describe('listEvents()', () => {
    it('filters by familyKey', async () => {
      await repo.writeEvent(makeEvent({ id: 'ae-1', familyKey: 'app/proc/step' }));
      await repo.writeEvent(makeEvent({ id: 'ae-2', familyKey: 'other' }));
      const results = await repo.listEvents('app/proc/step');
      expect(results).toHaveLength(1);
    });

    it('applies trigger filter', async () => {
      await repo.writeEvent(makeEvent({ id: 'ae-1', trigger: 'scheduled' }));
      await repo.writeEvent(makeEvent({ id: 'ae-2', trigger: 'plateau' }));
      const results = await repo.listEvents('app/proc/step', { trigger: 'plateau' });
      expect(results).toHaveLength(1);
    });

    it('applies since/until filters', async () => {
      const insertSQL = `INSERT INTO auto_apply_decision_records
        (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at, created_at)
        VALUES ($1, $2, '[]', '[]', $3, $4, $5, $6, $7)`;
      await pool.query(insertSQL, ['ae-d1', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-14T00:00:00Z', '2026-03-14T00:00:00Z']);
      await pool.query(insertSQL, ['ae-d2', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-15T12:00:00Z', '2026-03-15T12:00:00Z']);
      const results = await repo.listEvents('app/proc/step', {
        since: '2026-03-15T00:00:00Z', until: '2026-03-16T00:00:00Z',
      });
      expect(results).toHaveLength(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await repo.writeEvent(makeEvent({ id: `ae-${i}` }));
      const results = await repo.listEvents('app/proc/step', { limit: 3 });
      expect(results).toHaveLength(3);
    });
  });

  describe('find()', () => {
    it('returns all without filters', async () => {
      await repo.writeEvent(makeEvent({ id: 'ae-1', familyKey: 'a' }));
      await repo.writeEvent(makeEvent({ id: 'ae-2', familyKey: 'b' }));
      const results = await repo.find({});
      expect(results).toHaveLength(2);
    });

    it('applies trigger filter', async () => {
      await repo.writeEvent(makeEvent({ id: 'ae-1', trigger: 'manual' }));
      await repo.writeEvent(makeEvent({ id: 'ae-2', trigger: 'scheduled' }));
      const results = await repo.find({ trigger: 'manual' });
      expect(results).toHaveLength(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await repo.writeEvent(makeEvent({ id: `ae-fl-${i}` }));
      expect(await repo.find({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('ON CONFLICT DO NOTHING', () => {
    it('does not error on duplicate id', async () => {
      await repo.writeEvent(makeEvent({ id: 'ae-dup' }));
      await repo.writeEvent(makeEvent({ id: 'ae-dup' }));
      const result = await pool.query(
        'SELECT count(*)::int AS cnt FROM auto_apply_decision_records WHERE id = $1', ['ae-dup'],
      );
      expect(result.rows[0].cnt).toBe(1);
    });
  });
});

describe('PgAdaptationRecommendationRepository', () => {
  let recRepo: PgAdaptationRecommendationRepository;
  beforeEach(() => { recRepo = new PgAdaptationRecommendationRepository(pool as any); });

  describe('listPending()', () => {
    it('returns pending recommendations', async () => {
      await pool.query(
        `INSERT INTO adaptation_approval_records (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-1', 'fam/a', 'rec-1', 'pending', '2026-03-16T12:00:00Z', '2026-03-17T12:00:00Z'],
      );
      await pool.query(
        `INSERT INTO adaptation_approval_records (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-2', 'fam/b', 'rec-2', 'approved', '2026-03-16T11:00:00Z', '2026-03-17T12:00:00Z'],
      );
      const results = await recRepo.listPending();
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('pending');
    });

    it('returns empty when none pending', async () => {
      expect(await recRepo.listPending()).toHaveLength(0);
    });
  });
});
