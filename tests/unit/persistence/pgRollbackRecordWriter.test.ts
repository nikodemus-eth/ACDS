// ---------------------------------------------------------------------------
// Integration Tests – PgRollbackRecordWriter (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgRollbackRecordWriter } from '@acds/persistence-pg';
import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';
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

function makeRollbackRecord(
  overrides: Partial<AdaptationRollbackRecord> = {},
): AdaptationRollbackRecord {
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
  let writer: PgRollbackRecordWriter;

  beforeEach(() => {
    writer = new PgRollbackRecordWriter(pool as any);
  });

  describe('save()', () => {
    it('inserts a record and all fields are persisted correctly', async () => {
      const record = makeRollbackRecord();
      await writer.save(record);

      const result = await pool.query(
        'SELECT * FROM adaptation_rollback_records WHERE id = $1',
        [record.id],
      );

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.id).toBe('rb-001');
      expect(row.family_key).toBe('app/proc/step');
      expect(row.snapshot_id).toBe('ae-100');
      expect(row.reason).toBe('Performance regression detected');
      expect(row.executed_by).toBe('admin@example.com');
      expect(row.target_adaptation_event_id).toBe('ae-100');
    });

    it('stores snapshots as retrievable JSON', async () => {
      const record = makeRollbackRecord();
      await writer.save(record);

      const result = await pool.query(
        'SELECT previous_snapshot, restored_snapshot FROM adaptation_rollback_records WHERE id = $1',
        [record.id],
      );

      const row = result.rows[0];
      const previous =
        typeof row.previous_snapshot === 'string'
          ? JSON.parse(row.previous_snapshot as string)
          : row.previous_snapshot;
      const restored =
        typeof row.restored_snapshot === 'string'
          ? JSON.parse(row.restored_snapshot as string)
          : row.restored_snapshot;

      expect(previous.familyKey).toBe('app/proc/step');
      expect(previous.candidateRankings).toHaveLength(2);
      expect(previous.candidateRankings[0].candidateId).toBe('cand-a');
      expect(previous.explorationRate).toBe(0.1);

      expect(restored.candidateRankings[0].candidateId).toBe('cand-b');
      expect(restored.explorationRate).toBe(0.15);
    });

    it('ON CONFLICT DO NOTHING — saving the same id twice results in one row', async () => {
      const record = makeRollbackRecord();
      await writer.save(record);
      await writer.save(record); // duplicate

      const result = await pool.query(
        'SELECT count(*)::int AS cnt FROM adaptation_rollback_records WHERE id = $1',
        [record.id],
      );

      expect(result.rows[0].cnt).toBe(1);
    });

    it('propagates database errors (NOT NULL violation)', async () => {
      const record = makeRollbackRecord({ reason: null as any });

      await expect(writer.save(record)).rejects.toThrow();
    });
  });
});
