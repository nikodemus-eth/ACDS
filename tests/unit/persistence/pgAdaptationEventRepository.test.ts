// ---------------------------------------------------------------------------
// Integration Tests – PgAdaptationEventRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAdaptationEventRepository, PgAdaptationRecommendationRepository } from '@acds/persistence-pg';
import type { AdaptationEvent, RankedCandidate } from '@acds/adaptive-optimizer';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

let pool: PoolLike;
let repo: PgAdaptationEventRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
  repo = new PgAdaptationEventRepository(pool as any);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRankedCandidate(id: string, rank: number, score: number): RankedCandidate {
  return {
    candidate: {
      candidateId: id,
      familyKey: 'app/proc/step',
      modelProfileId: `profile-${id}`,
      tacticProfileId: `tactic-${id}`,
      providerId: `prov-${id}`,
    },
    rank,
    compositeScore: score,
    breakdown: {
      performanceScore: score,
      costScore: 0.5,
      latencyScore: 0.5,
      recencyBonus: 0,
      explorationBonus: 0,
    },
  };
}

function makeAdaptationEvent(overrides: Partial<AdaptationEvent> = {}): AdaptationEvent {
  return {
    id: 'ae-001',
    familyKey: 'app/proc/step',
    previousRanking: [makeRankedCandidate('cand-a', 1, 0.9)],
    newRanking: [makeRankedCandidate('cand-b', 1, 0.95)],
    trigger: 'scheduled',
    evidenceSummary: 'Score improvement detected',
    mode: 'auto_apply_low_risk',
    policyBoundsSnapshot: {
      explorationRate: 0.1,
      mode: 'auto_apply_low_risk',
      additionalConstraints: {},
    },
    createdAt: '2026-03-16T12:00:00.000Z',
    ...overrides,
  };
}

// ── writeEvent + getEvent round-trip ────────────────────────────────────────

describe('PgAdaptationEventRepository', () => {
  describe('writeEvent + getEvent round-trip', () => {
    it('writes an event and reads it back with correct field mapping', async () => {
      const event = makeAdaptationEvent();
      await repo.writeEvent(event);

      const result = await repo.getEvent('ae-001');
      expect(result).toBeDefined();
      expect(result!.id).toBe('ae-001');
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.evidenceSummary).toBe('Score improvement detected');
      expect(result!.mode).toBe('auto_apply_low_risk');
      expect(result!.trigger).toBe('auto_apply_low_risk'); // mapRow uses mode for trigger
      expect(result!.previousRanking).toHaveLength(1);
      expect(result!.previousRanking[0].candidate.candidateId).toBe('cand-a');
      expect(result!.newRanking).toHaveLength(1);
      expect(result!.newRanking[0].candidate.candidateId).toBe('cand-b');
      expect(result!.createdAt).toBeDefined();
    });
  });

  // ── getEvent ──────────────────────────────────────────────────────────────

  describe('getEvent()', () => {
    it('returns undefined for a missing id', async () => {
      const result = await repo.getEvent('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // ── listEvents ────────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('filters by familyKey', async () => {
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-fk1', familyKey: 'app/proc/step' }));
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-fk2', familyKey: 'other/family' }));

      const results = await repo.listEvents('app/proc/step');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ae-fk1');
    });

    it('applies trigger filter (maps to risk_basis column)', async () => {
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-t1', trigger: 'scheduled' }));
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-t2', trigger: 'plateau' }));

      const results = await repo.listEvents('app/proc/step', { trigger: 'plateau' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ae-t2');
    });

    it('applies since/until filters', async () => {
      // Insert rows with controlled created_at via raw SQL (writeEvent sets applied_at but created_at defaults to NOW)
      const insertSQL = `INSERT INTO auto_apply_decision_records
        (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at, created_at)
        VALUES ($1, $2, '[]', '[]', $3, $4, $5, $6, $7)`;
      await pool.query(insertSQL, ['ae-d1', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-14T00:00:00.000Z', '2026-03-14T00:00:00.000Z']);
      await pool.query(insertSQL, ['ae-d2', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-15T12:00:00.000Z', '2026-03-15T12:00:00.000Z']);
      await pool.query(insertSQL, ['ae-d3', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-17T00:00:00.000Z', '2026-03-17T00:00:00.000Z']);

      const results = await repo.listEvents('app/proc/step', {
        since: '2026-03-15T00:00:00.000Z',
        until: '2026-03-16T00:00:00.000Z',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ae-d2');
    });

    it('respects the limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.writeEvent(
          makeAdaptationEvent({
            id: `ae-lim-${i}`,
            createdAt: new Date(Date.now() - i * 60_000).toISOString(),
          }),
        );
      }

      const results = await repo.listEvents('app/proc/step', { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('defaults limit to 100 (does not over-limit small result sets)', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.writeEvent(makeAdaptationEvent({ id: `ae-def-${i}` }));
      }

      const results = await repo.listEvents('app/proc/step');
      expect(results).toHaveLength(5); // all 5 returned, well under 100
    });
  });

  // ── find() ────────────────────────────────────────────────────────────────

  describe('find()', () => {
    it('returns all events without filters', async () => {
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-f1', familyKey: 'fam/a' }));
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-f2', familyKey: 'fam/b' }));

      const results = await repo.find({});
      expect(results).toHaveLength(2);
    });

    it('applies trigger filter (maps to mode column)', async () => {
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-fm1', mode: 'auto_apply_low_risk' }));
      await repo.writeEvent(makeAdaptationEvent({ id: 'ae-fm2', mode: 'recommend_only' }));

      const results = await repo.find({ trigger: 'recommend_only' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ae-fm2');
    });

    it('applies date range filters', async () => {
      // Insert rows with controlled created_at via raw SQL
      const insertSQL = `INSERT INTO auto_apply_decision_records
        (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at, created_at)
        VALUES ($1, $2, '[]', '[]', $3, $4, $5, $6, $7)`;
      await pool.query(insertSQL, ['ae-fd1', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-14T00:00:00.000Z', '2026-03-14T00:00:00.000Z']);
      await pool.query(insertSQL, ['ae-fd2', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-15T12:00:00.000Z', '2026-03-15T12:00:00.000Z']);
      await pool.query(insertSQL, ['ae-fd3', 'app/proc/step', 'r', 'auto_apply_low_risk', 'scheduled', '2026-03-17T00:00:00.000Z', '2026-03-17T00:00:00.000Z']);

      const results = await repo.find({
        since: '2026-03-15T00:00:00.000Z',
        until: '2026-03-16T00:00:00.000Z',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ae-fd2');
    });
  });

  // ── find() with limit ───────────────────────────────────────────────────

  describe('find() with limit', () => {
    it('respects the limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.writeEvent(
          makeAdaptationEvent({
            id: `ae-fl-${i}`,
            createdAt: new Date(Date.now() - i * 60_000).toISOString(),
          }),
        );
      }

      const results = await repo.find({ limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  // ── ON CONFLICT DO NOTHING ────────────────────────────────────────────────

  describe('ON CONFLICT DO NOTHING', () => {
    it('does not error or duplicate when writing same id twice', async () => {
      const event = makeAdaptationEvent({ id: 'ae-dup' });

      await repo.writeEvent(event);
      await repo.writeEvent(event); // second write — should be silently ignored

      const result = await pool.query(
        'SELECT count(*)::int AS cnt FROM auto_apply_decision_records WHERE id = $1',
        ['ae-dup'],
      );
      expect(result.rows[0].cnt).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// PgAdaptationRecommendationRepository
// ---------------------------------------------------------------------------

describe('PgAdaptationRecommendationRepository', () => {
  let recRepo: PgAdaptationRecommendationRepository;

  beforeEach(() => {
    recRepo = new PgAdaptationRecommendationRepository(pool as any);
  });

  describe('listPending()', () => {
    it('returns pending recommendations from adaptation_approval_records', async () => {
      // Insert pending and non-pending records
      await pool.query(
        `INSERT INTO adaptation_approval_records
           (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-1', 'fam/a', 'rec-1', 'pending', '2026-03-16T12:00:00Z', '2026-03-17T12:00:00Z'],
      );
      await pool.query(
        `INSERT INTO adaptation_approval_records
           (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-2', 'fam/b', 'rec-2', 'approved', '2026-03-16T11:00:00Z', '2026-03-17T12:00:00Z'],
      );
      await pool.query(
        `INSERT INTO adaptation_approval_records
           (id, family_key, recommendation_id, status, submitted_at, reason, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['apr-3', 'fam/c', 'rec-3', 'pending', '2026-03-16T10:00:00Z', 'Needs review', '2026-03-17T12:00:00Z'],
      );

      const results = await recRepo.listPending();
      expect(results).toHaveLength(2);
      // Ordered by submitted_at DESC
      expect(results[0].id).toBe('rec-1');
      expect(results[0].familyKey).toBe('fam/a');
      expect(results[0].status).toBe('pending');
      expect(results[0].recommendedRanking).toEqual([]);
      expect(results[1].id).toBe('rec-3');
      expect(results[1].evidence).toBe('Needs review');
    });

    it('returns empty array when no pending records', async () => {
      await pool.query(
        `INSERT INTO adaptation_approval_records
           (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-1', 'fam/a', 'rec-1', 'approved', '2026-03-16T12:00:00Z', '2026-03-17T12:00:00Z'],
      );

      const results = await recRepo.listPending();
      expect(results).toHaveLength(0);
    });

    it('maps row with null reason to empty evidence string', async () => {
      await pool.query(
        `INSERT INTO adaptation_approval_records
           (id, family_key, recommendation_id, status, submitted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['apr-1', 'fam/a', 'rec-1', 'pending', '2026-03-16T12:00:00Z', '2026-03-17T12:00:00Z'],
      );

      const results = await recRepo.listPending();
      expect(results[0].evidence).toBe('');
    });
  });
});
