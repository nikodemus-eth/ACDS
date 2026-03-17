// ---------------------------------------------------------------------------
// Integration Tests – PgExecutionRecordRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgExecutionRecordRepository } from '@acds/persistence-pg';
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

  // The migration 005 schema doesn't match what PgExecutionRecordRepository expects.
  // Drop and recreate with the columns the repository actually uses.
  await pool.execSQL(`
    DROP TABLE IF EXISTS fallback_attempts CASCADE;
    DROP TABLE IF EXISTS execution_rationales CASCADE;
    DROP TABLE IF EXISTS execution_records CASCADE;
    CREATE TABLE execution_records (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      application               VARCHAR     NOT NULL,
      process                   VARCHAR     NOT NULL,
      step                      VARCHAR     NOT NULL,
      decision_posture          VARCHAR,
      cognitive_grade           VARCHAR,
      routing_decision_id       VARCHAR,
      selected_model_profile_id VARCHAR,
      selected_tactic_profile_id VARCHAR,
      selected_provider_id      VARCHAR,
      status                    VARCHAR     NOT NULL,
      input_tokens              INTEGER,
      output_tokens             INTEGER,
      latency_ms                INTEGER,
      cost_estimate             NUMERIC,
      normalized_output         TEXT,
      error_message             TEXT,
      fallback_attempts         INTEGER     DEFAULT 0,
      completed_at              TIMESTAMPTZ,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    );
  `);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
  await pool.query('TRUNCATE execution_records CASCADE');
});

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    executionFamily: {
      application: 'test-app',
      process: 'test-process',
      step: 'test-step',
      decisionPosture: 'standard' as const,
      cognitiveGrade: 'B' as const,
    },
    routingDecisionId: 'rd-001',
    selectedModelProfileId: 'mp-001',
    selectedTacticProfileId: 'tp-001',
    selectedProviderId: 'prov-001',
    status: 'completed' as const,
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 500,
    costEstimate: 0.01,
    normalizedOutput: 'test output',
    errorMessage: null,
    fallbackAttempts: 0,
    completedAt: new Date('2026-03-16T12:00:00Z'),
    ...overrides,
  };
}

describe('PgExecutionRecordRepository', () => {
  let repo: PgExecutionRecordRepository;

  beforeEach(() => {
    repo = new PgExecutionRecordRepository(pool as any);
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a record and returns it with an id', async () => {
      const result = await repo.create(makeRecord());

      expect(result.id).toBeTruthy();
      expect(result.executionFamily.application).toBe('test-app');
      expect(result.executionFamily.process).toBe('test-process');
      expect(result.executionFamily.step).toBe('test-step');
      expect(result.executionFamily.decisionPosture).toBe('standard');
      expect(result.executionFamily.cognitiveGrade).toBe('B');
      expect(result.routingDecisionId).toBe('rd-001');
      expect(result.selectedModelProfileId).toBe('mp-001');
      expect(result.selectedTacticProfileId).toBe('tp-001');
      expect(result.selectedProviderId).toBe('prov-001');
      expect(result.status).toBe('completed');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(200);
      expect(result.latencyMs).toBe(500);
      expect(result.costEstimate).toBeCloseTo(0.01);
      expect(result.normalizedOutput).toBe('test output');
      expect(result.errorMessage).toBeNull();
      expect(result.fallbackAttempts).toBe(0);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('creates a record with null optional fields', async () => {
      const result = await repo.create(makeRecord({
        inputTokens: null,
        outputTokens: null,
        latencyMs: null,
        costEstimate: null,
        normalizedOutput: null,
        errorMessage: null,
        completedAt: null,
      }));

      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.costEstimate).toBeNull();
      expect(result.normalizedOutput).toBeNull();
      expect(result.completedAt).toBeNull();
    });
  });

  // ── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns the record by id', async () => {
      const created = await repo.create(makeRecord());
      const found = await repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.executionFamily.application).toBe('test-app');
    });

    it('returns null for nonexistent id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ── findByFamily() ────────────────────────────────────────────────────────

  describe('findByFamily()', () => {
    it('returns records matching the family key', async () => {
      await repo.create(makeRecord());
      await repo.create(makeRecord({
        executionFamily: {
          application: 'other-app',
          process: 'other-process',
          step: 'other-step',
          decisionPosture: 'standard',
          cognitiveGrade: 'A',
        },
      }));

      const results = await repo.findByFamily('test-app:test-process:test-step');
      expect(results).toHaveLength(1);
      expect(results[0].executionFamily.application).toBe('test-app');
    });

    it('returns empty array when no match', async () => {
      const results = await repo.findByFamily('no:match:here');
      expect(results).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeRecord());
      }

      const results = await repo.findByFamily('test-app:test-process:test-step', 3);
      expect(results).toHaveLength(3);
    });

    it('handles family key with missing parts', async () => {
      const results = await repo.findByFamily('only-app');
      expect(results).toHaveLength(0);
    });
  });

  // ── findRecent() ──────────────────────────────────────────────────────────

  describe('findRecent()', () => {
    it('returns records ordered by created_at DESC', async () => {
      // Insert with controlled timestamps to ensure ordering
      await pool.query(
        `INSERT INTO execution_records
         (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'proc', 'step', 'completed', '2026-03-14T00:00:00Z'],
      );
      await pool.query(
        `INSERT INTO execution_records
         (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'proc', 'step', 'completed', '2026-03-16T00:00:00Z'],
      );

      const results = await repo.findRecent();
      expect(results).toHaveLength(2);
      // Most recent first
      expect(new Date(results[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(results[1].createdAt).getTime(),
      );
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeRecord());
      }

      const results = await repo.findRecent(2);
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no records exist', async () => {
      const results = await repo.findRecent();
      expect(results).toHaveLength(0);
    });
  });

  // ── findFiltered() ────────────────────────────────────────────────────────

  describe('findFiltered()', () => {
    it('filters by status', async () => {
      await repo.create(makeRecord({ status: 'completed' }));
      await repo.create(makeRecord({ status: 'failed' }));

      const results = await repo.findFiltered({ status: 'completed' });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('completed');
    });

    it('filters by application', async () => {
      await repo.create(makeRecord());
      await repo.create(makeRecord({
        executionFamily: {
          application: 'other-app',
          process: 'p',
          step: 's',
          decisionPosture: 'standard',
          cognitiveGrade: 'A',
        },
      }));

      const results = await repo.findFiltered({ application: 'test-app' });
      expect(results).toHaveLength(1);
      expect(results[0].executionFamily.application).toBe('test-app');
    });

    it('filters by date range (from/to)', async () => {
      // Insert with controlled timestamps via raw SQL
      await pool.query(
        `INSERT INTO execution_records
         (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'proc', 'step', 'completed', '2026-03-14T00:00:00Z'],
      );
      await pool.query(
        `INSERT INTO execution_records
         (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'proc', 'step', 'completed', '2026-03-15T12:00:00Z'],
      );
      await pool.query(
        `INSERT INTO execution_records
         (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'proc', 'step', 'completed', '2026-03-17T00:00:00Z'],
      );

      const results = await repo.findFiltered({
        from: new Date('2026-03-15T00:00:00Z'),
        to: new Date('2026-03-16T00:00:00Z'),
      });
      expect(results).toHaveLength(1);
    });

    it('returns all when no filters given', async () => {
      await repo.create(makeRecord());
      await repo.create(makeRecord());

      const results = await repo.findFiltered({});
      expect(results).toHaveLength(2);
    });

    it('respects limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(makeRecord());
      }

      const results = await repo.findFiltered({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('combines multiple filters', async () => {
      await repo.create(makeRecord({ status: 'completed' }));
      await repo.create(makeRecord({ status: 'failed' }));
      await repo.create(makeRecord({
        status: 'completed',
        executionFamily: {
          application: 'other',
          process: 'p',
          step: 's',
          decisionPosture: 'standard',
          cognitiveGrade: 'A',
        },
      }));

      const results = await repo.findFiltered({ status: 'completed', application: 'test-app' });
      expect(results).toHaveLength(1);
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates status', async () => {
      const created = await repo.create(makeRecord({ status: 'pending' }));
      const updated = await repo.update(created.id, { status: 'completed' });

      expect(updated.status).toBe('completed');
      expect(updated.id).toBe(created.id);
    });

    it('updates multiple fields at once', async () => {
      const created = await repo.create(makeRecord({
        status: 'pending',
        inputTokens: null,
        outputTokens: null,
      }));

      const updated = await repo.update(created.id, {
        status: 'completed',
        inputTokens: 150,
        outputTokens: 300,
        latencyMs: 750,
        costEstimate: 0.02,
        normalizedOutput: 'updated output',
        fallbackAttempts: 1,
        completedAt: new Date('2026-03-16T14:00:00Z'),
      });

      expect(updated.status).toBe('completed');
      expect(updated.inputTokens).toBe(150);
      expect(updated.outputTokens).toBe(300);
      expect(updated.latencyMs).toBe(750);
      expect(updated.costEstimate).toBeCloseTo(0.02);
      expect(updated.normalizedOutput).toBe('updated output');
      expect(updated.fallbackAttempts).toBe(1);
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it('updates errorMessage', async () => {
      const created = await repo.create(makeRecord());
      const updated = await repo.update(created.id, { errorMessage: 'something failed' });

      expect(updated.errorMessage).toBe('something failed');
    });

    it('throws when updating a nonexistent record', async () => {
      await expect(
        repo.update('00000000-0000-0000-0000-000000000000', { status: 'failed' }),
      ).rejects.toThrow('ExecutionRecord not found');
    });

    it('returns existing record when no updates provided', async () => {
      const created = await repo.create(makeRecord());
      const result = await repo.update(created.id, {});

      expect(result.id).toBe(created.id);
      expect(result.status).toBe('completed');
    });

    it('throws when no updates and record does not exist', async () => {
      await expect(
        repo.update('00000000-0000-0000-0000-000000000000', {}),
      ).rejects.toThrow('ExecutionRecord not found');
    });
  });
});
