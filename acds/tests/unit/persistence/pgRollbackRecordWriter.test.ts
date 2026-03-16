// ---------------------------------------------------------------------------
// Unit Tests – PgRollbackRecordWriter
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgRollbackRecordWriter } from '@acds/persistence-pg';
import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

function makeRollbackRecord(overrides: Partial<AdaptationRollbackRecord> = {}): AdaptationRollbackRecord {
  return {
    id: 'rb-001',
    familyKey: 'app/proc/step',
    targetAdaptationEventId: 'ae-100',
    previousSnapshot: {
      familyKey: 'app/proc/step',
      candidateRankings: [
        { candidateId: 'cand-a', rank: 1, score: 0.9 },
        { candidateId: 'cand-b', rank: 2, score: 0.7 },
      ],
      explorationRate: 0.1,
      capturedAt: '2026-03-16T10:00:00.000Z',
    },
    restoredSnapshot: {
      familyKey: 'app/proc/step',
      candidateRankings: [
        { candidateId: 'cand-b', rank: 1, score: 0.8 },
        { candidateId: 'cand-a', rank: 2, score: 0.6 },
      ],
      explorationRate: 0.15,
      capturedAt: '2026-03-15T08:00:00.000Z',
    },
    actor: 'admin@example.com',
    reason: 'Performance regression detected',
    rolledBackAt: '2026-03-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('PgRollbackRecordWriter', () => {
  let pool: ReturnType<typeof createMockPool>;
  let writer: PgRollbackRecordWriter;

  beforeEach(() => {
    pool = createMockPool();
    writer = new PgRollbackRecordWriter(pool as any);
  });

  describe('save()', () => {
    it('inserts a rollback record with all fields', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const record = makeRollbackRecord();
      await writer.save(record);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO adaptation_rollback_records');
      expect(call[0]).toContain('ON CONFLICT (id) DO NOTHING');

      const params = call[1];
      expect(params[0]).toBe('rb-001');
      expect(params[1]).toBe('app/proc/step');
      expect(params[2]).toBe('ae-100'); // snapshot_id = targetAdaptationEventId
      expect(params[3]).toBe('Performance regression detected');
      expect(params[4]).toBe('admin@example.com');
      expect(params[5]).toBe('2026-03-16T12:00:00.000Z');
      expect(params[6]).toBe('ae-100'); // target_adaptation_event_id
    });

    it('serializes snapshots as JSON strings', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const record = makeRollbackRecord();
      await writer.save(record);

      const params = pool.query.mock.calls[0][1];
      const previousSnapshot = JSON.parse(params[7]);
      const restoredSnapshot = JSON.parse(params[8]);

      expect(previousSnapshot.familyKey).toBe('app/proc/step');
      expect(previousSnapshot.candidateRankings).toHaveLength(2);
      expect(restoredSnapshot.candidateRankings[0].candidateId).toBe('cand-b');
    });

    it('does not throw on duplicate insert (ON CONFLICT DO NOTHING)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(writer.save(makeRollbackRecord())).resolves.toBeUndefined();
    });

    it('propagates database errors', async () => {
      pool.query.mockRejectedValueOnce(new Error('connection refused'));

      await expect(writer.save(makeRollbackRecord())).rejects.toThrow('connection refused');
    });
  });
});
