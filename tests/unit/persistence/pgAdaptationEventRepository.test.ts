// ---------------------------------------------------------------------------
// Unit Tests – PgAdaptationEventRepository (AdaptationLedgerWriter extension)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgAdaptationEventRepository } from '@acds/persistence-pg';
import type { AdaptationEvent } from '@acds/adaptive-optimizer';
import type { RankedCandidate } from '@acds/adaptive-optimizer';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

function makeRankedCandidate(id: string, rank: number, score: number): RankedCandidate {
  return {
    candidate: { candidateId: id, familyKey: 'app/proc/step', modelProfileId: `profile-${id}`, tacticProfileId: `tactic-${id}`, providerId: `prov-${id}` },
    rank,
    compositeScore: score,
    breakdown: { performanceScore: score, costScore: 0.5, latencyScore: 0.5, recencyBonus: 0, explorationBonus: 0 },
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

describe('PgAdaptationEventRepository', () => {
  let pool: ReturnType<typeof createMockPool>;
  let repo: PgAdaptationEventRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PgAdaptationEventRepository(pool as any);
  });

  // ── writeEvent() ────────────────────────────────────────────────────────

  describe('writeEvent()', () => {
    it('inserts an adaptation event into auto_apply_decision_records', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeAdaptationEvent();
      await repo.writeEvent(event);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO auto_apply_decision_records');

      const params = call[1];
      expect(params[0]).toBe('ae-001');
      expect(params[1]).toBe('app/proc/step');
      expect(params[4]).toBe('Score improvement detected'); // reason = evidenceSummary
      expect(params[5]).toBe('auto_apply_low_risk'); // mode
      expect(params[6]).toBe('scheduled'); // risk_basis = trigger
      expect(params[7]).toBe('2026-03-16T12:00:00.000Z');
    });

    it('serializes rankings as JSON', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await repo.writeEvent(makeAdaptationEvent());

      const params = pool.query.mock.calls[0][1];
      const previousRanking = JSON.parse(params[2]);
      const newRanking = JSON.parse(params[3]);

      expect(previousRanking).toHaveLength(1);
      expect(previousRanking[0].candidate.candidateId).toBe('cand-a');
      expect(newRanking[0].candidate.candidateId).toBe('cand-b');
    });

    it('handles ON CONFLICT without error', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repo.writeEvent(makeAdaptationEvent())).resolves.toBeUndefined();
    });
  });

  // ── getEvent() ──────────────────────────────────────────────────────────

  describe('getEvent()', () => {
    it('returns undefined when no event found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getEvent('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns a mapped AdaptationEvent when found', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ae-001',
          family_key: 'app/proc/step',
          previous_ranking: [{ candidate: { candidateId: 'cand-a' }, rank: 1, compositeScore: 0.9 }],
          new_ranking: [{ candidate: { candidateId: 'cand-b' }, rank: 1, compositeScore: 0.95 }],
          mode: 'auto_apply_low_risk',
          reason: 'Score improvement',
          created_at: new Date('2026-03-16T12:00:00.000Z'),
        }],
      });

      const result = await repo.getEvent('ae-001');
      expect(result).toBeDefined();
      expect(result!.id).toBe('ae-001');
      expect(result!.familyKey).toBe('app/proc/step');
      expect(result!.evidenceSummary).toBe('Score improvement');

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('WHERE id = $1');
      expect(call[1]).toEqual(['ae-001']);
    });
  });

  // ── listEvents() ────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('filters by familyKey', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.listEvents('app/proc/step');

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('family_key = $1');
      expect(call[1][0]).toBe('app/proc/step');
    });

    it('applies trigger filter', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.listEvents('app/proc/step', { trigger: 'plateau' });

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('risk_basis = $2');
      expect(call[1][1]).toBe('plateau');
    });

    it('applies since/until filters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.listEvents('app/proc/step', {
        since: '2026-03-15T00:00:00.000Z',
        until: '2026-03-16T23:59:59.000Z',
      });

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('created_at >= $2');
      expect(call[0]).toContain('created_at <= $3');
    });

    it('respects the limit filter', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.listEvents('app/proc/step', { limit: 10 });

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('LIMIT $2');
      expect(call[1]).toContain(10);
    });

    it('defaults limit to 100', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.listEvents('app/proc/step');

      const call = pool.query.mock.calls[0];
      expect(call[1]).toContain(100);
    });

    it('maps result rows to AdaptationEvent objects', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ae-002',
          family_key: 'app/proc/step',
          previous_ranking: [],
          new_ranking: [],
          mode: 'recommend_only',
          reason: 'Scheduled check',
          created_at: new Date('2026-03-16T10:00:00.000Z'),
        }],
      });

      const events = await repo.listEvents('app/proc/step');
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('ae-002');
      expect(events[0].trigger).toBe('recommend_only');
    });
  });

  // ── find() (existing reader method) ─────────────────────────────────────

  describe('find()', () => {
    it('builds query without filters when none provided', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.find({});

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('SELECT * FROM auto_apply_decision_records');
      expect(call[0]).not.toContain('WHERE');
    });

    it('applies trigger filter using mode column', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.find({ trigger: 'manual' });

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('mode = $1');
    });

    it('applies date range filters', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await repo.find({
        since: '2026-03-15T00:00:00.000Z',
        until: '2026-03-16T23:59:59.000Z',
      });

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('created_at >= $1');
      expect(call[0]).toContain('created_at <= $2');
    });
  });
});
