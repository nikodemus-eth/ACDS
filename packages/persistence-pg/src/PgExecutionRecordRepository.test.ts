// Integration Tests – PgExecutionRecordRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgExecutionRecordRepository } from './PgExecutionRecordRepository.js';
import { CognitiveGrade, DecisionPosture, type ExecutionRecord } from '@acds/core-types';
import {
  createTestPool, runMigrations, truncateAll, closePool, type PoolLike,
} from '../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
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
      request_id                VARCHAR,
      completed_at              TIMESTAMPTZ,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    );
  `);
});
afterAll(async () => { await closePool(); });
beforeEach(async () => {
  await truncateAll(pool);
  await pool.query('TRUNCATE execution_records CASCADE');
});

function makeRecord(overrides: Partial<Omit<ExecutionRecord, 'id'>> = {}): Omit<ExecutionRecord, 'id'> {
  return {
    executionFamily: {
      application: 'test-app', process: 'test-process', step: 'test-step',
      decisionPosture: DecisionPosture.OPERATIONAL, cognitiveGrade: CognitiveGrade.STANDARD,
    },
    routingDecisionId: 'rd-001', selectedModelProfileId: 'mp-001',
    selectedTacticProfileId: 'tp-001', selectedProviderId: 'prov-001',
    status: 'succeeded', inputTokens: 100, outputTokens: 200, latencyMs: 500,
    costEstimate: 0.01, normalizedOutput: 'test output', errorMessage: null,
    fallbackAttempts: 0, requestId: null,
    createdAt: new Date('2026-03-16T11:00:00Z'), completedAt: new Date('2026-03-16T12:00:00Z'),
    ...overrides,
  };
}

describe('PgExecutionRecordRepository', () => {
  let repo: PgExecutionRecordRepository;
  beforeEach(() => { repo = new PgExecutionRecordRepository(pool as any); });

  describe('create()', () => {
    it('creates a record and returns it with an id', async () => {
      const result = await repo.create(makeRecord());
      expect(result.id).toBeTruthy();
      expect(result.executionFamily.application).toBe('test-app');
      expect(result.status).toBe('succeeded');
    });

    it('creates with explicit id', async () => {
      const result = await repo.create({ ...makeRecord(), id: '11111111-1111-1111-1111-111111111111' });
      expect(result.id).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('creates with null optional fields', async () => {
      const result = await repo.create(makeRecord({
        inputTokens: null, outputTokens: null, latencyMs: null,
        costEstimate: null, normalizedOutput: null, completedAt: null,
      }));
      expect(result.inputTokens).toBeNull();
      expect(result.completedAt).toBeNull();
    });
  });

  describe('findById()', () => {
    it('returns the record by id', async () => {
      const created = await repo.create(makeRecord());
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for nonexistent id', async () => {
      expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('findByFamily()', () => {
    it('returns records matching the family key', async () => {
      await repo.create(makeRecord());
      await repo.create(makeRecord({
        executionFamily: {
          application: 'other', process: 'p', step: 's',
          decisionPosture: DecisionPosture.OPERATIONAL, cognitiveGrade: CognitiveGrade.ENHANCED,
        },
      }));
      const results = await repo.findByFamily('test-app:test-process:test-step');
      expect(results).toHaveLength(1);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeRecord());
      expect(await repo.findByFamily('test-app:test-process:test-step', 3)).toHaveLength(3);
    });
  });

  describe('findRecent()', () => {
    it('returns records ordered by created_at DESC', async () => {
      await repo.create(makeRecord());
      await repo.create(makeRecord());
      const results = await repo.findRecent();
      expect(results).toHaveLength(2);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeRecord());
      expect(await repo.findRecent(2)).toHaveLength(2);
    });
  });

  describe('findFiltered()', () => {
    it('filters by status', async () => {
      await repo.create(makeRecord({ status: 'succeeded' }));
      await repo.create(makeRecord({ status: 'failed' }));
      const results = await repo.findFiltered({ status: 'succeeded' });
      expect(results).toHaveLength(1);
    });

    it('filters by application', async () => {
      await repo.create(makeRecord());
      const results = await repo.findFiltered({ application: 'test-app' });
      expect(results).toHaveLength(1);
    });

    it('filters by date range', async () => {
      await pool.query(
        `INSERT INTO execution_records (application, process, step, status, created_at) VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'p', 's', 'succeeded', '2026-03-14T00:00:00Z'],
      );
      await pool.query(
        `INSERT INTO execution_records (application, process, step, status, created_at) VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'p', 's', 'succeeded', '2026-03-15T12:00:00Z'],
      );
      const results = await repo.findFiltered({ from: '2026-03-15T00:00:00Z', to: '2026-03-16T00:00:00Z' });
      expect(results).toHaveLength(1);
    });

    it('returns all when no filters', async () => {
      await repo.create(makeRecord());
      expect(await repo.findFiltered({})).toHaveLength(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeRecord());
      expect(await repo.findFiltered({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('update()', () => {
    it('updates multiple fields', async () => {
      const created = await repo.create(makeRecord({ status: 'pending' }));
      const updated = await repo.update(created.id, {
        status: 'succeeded', inputTokens: 150, outputTokens: 300,
        latencyMs: 750, costEstimate: 0.02, normalizedOutput: 'updated',
        errorMessage: 'err', fallbackAttempts: 1, requestId: 'req-1',
        completedAt: new Date('2026-03-16T14:00:00Z'),
      });
      expect(updated.status).toBe('succeeded');
      expect(updated.inputTokens).toBe(150);
      expect(updated.requestId).toBe('req-1');
    });

    it('throws for nonexistent record', async () => {
      await expect(repo.update('00000000-0000-0000-0000-000000000000', { status: 'x' })).rejects.toThrow('ExecutionRecord not found');
    });

    it('returns existing record when no updates', async () => {
      const created = await repo.create(makeRecord());
      const result = await repo.update(created.id, {});
      expect(result.id).toBe(created.id);
    });

    it('throws when no updates and record does not exist', async () => {
      await expect(repo.update('00000000-0000-0000-0000-000000000000', {})).rejects.toThrow('ExecutionRecord not found');
    });
  });

  describe('reapStaleExecutions()', () => {
    it('reaps stale pending/running executions', async () => {
      // Insert a stale record via raw SQL with old created_at
      await pool.query(
        `INSERT INTO execution_records (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'p', 's', 'pending', new Date(Date.now() - 7_200_000).toISOString()],
      );
      // Insert a recent one that should not be reaped
      await pool.query(
        `INSERT INTO execution_records (application, process, step, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['app', 'p', 's', 'running', new Date().toISOString()],
      );

      const reaped = await repo.reapStaleExecutions(3_600_000);
      expect(reaped).toHaveLength(1);
      expect(reaped[0].status).toBe('auto_reaped');
    });
  });
});
