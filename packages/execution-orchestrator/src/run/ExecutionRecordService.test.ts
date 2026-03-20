import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ExecutionRecordService } from './ExecutionRecordService.js';
import { PgExecutionRecordRepository } from '@acds/persistence-pg';
import {
  CognitiveGrade,
  DecisionPosture,
  type ExecutionRecord,
} from '@acds/core-types';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let repo: PgExecutionRecordRepository;
let service: ExecutionRecordService;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE execution_records CASCADE');
  repo = new PgExecutionRecordRepository(pool as any);
  service = new ExecutionRecordService(repo);
});

afterAll(async () => {
  await closePool();
});

function makeRecord(overrides: Partial<Omit<ExecutionRecord, 'id'>> = {}): Omit<ExecutionRecord, 'id'> {
  return {
    executionFamily: {
      application: 'TestApp',
      process: 'Review',
      step: 'Analyze',
      decisionPosture: DecisionPosture.OPERATIONAL,
      cognitiveGrade: CognitiveGrade.STANDARD,
    },
    routingDecisionId: 'dec-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'provider-1',
    status: 'pending' as const,
    inputTokens: null,
    outputTokens: null,
    latencyMs: null,
    costEstimate: null,
    normalizedOutput: null,
    errorMessage: null,
    fallbackAttempts: 0,
    requestId: null,
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

describe('ExecutionRecordService', () => {
  it('creates a record and assigns an id', async () => {
    const record = await service.create(makeRecord());

    expect(record.id).toBeDefined();
    expect(typeof record.id).toBe('string');
    expect(record.status).toBe('pending');
  });

  it('retrieves a record by id', async () => {
    const created = await service.create(makeRecord());
    const found = await service.getById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('returns null for non-existent id', async () => {
    const found = await service.getById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('retrieves records by family', async () => {
    await service.create(makeRecord());
    await service.create(makeRecord());

    const results = await service.getByFamily('TestApp:Review:Analyze');
    expect(results).toHaveLength(2);
  });

  it('uses default limit of 50 for getByFamily', async () => {
    await service.create(makeRecord());
    const results = await service.getByFamily('TestApp:Review:Analyze');
    expect(results).toHaveLength(1);
  });

  it('retrieves recent records', async () => {
    await service.create(makeRecord());
    await service.create(makeRecord());
    await service.create(makeRecord());

    const results = await service.getRecent(2);
    expect(results).toHaveLength(2);
  });

  it('uses default limit of 50 for getRecent', async () => {
    await service.create(makeRecord());
    const results = await service.getRecent();
    expect(results).toHaveLength(1);
  });

  it('filters records by status', async () => {
    await service.create(makeRecord({ status: 'succeeded' }));
    await service.create(makeRecord({ status: 'failed' }));
    await service.create(makeRecord({ status: 'succeeded' }));

    const results = await service.getFiltered({ status: 'succeeded' });
    expect(results).toHaveLength(2);
  });

  it('filters records with limit', async () => {
    await service.create(makeRecord());
    await service.create(makeRecord());
    await service.create(makeRecord());

    const results = await service.getFiltered({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns empty array for filters matching nothing', async () => {
    await service.create(makeRecord({ status: 'succeeded' }));
    const results = await service.getFiltered({ status: 'failed' });
    expect(results).toHaveLength(0);
  });

  it('updates a record status', async () => {
    const created = await service.create(makeRecord());
    const updated = await service.updateStatus(created.id, {
      status: 'succeeded',
      latencyMs: 500,
      normalizedOutput: 'result',
    });

    expect(updated.status).toBe('succeeded');
    expect(updated.latencyMs).toBe(500);
    expect(updated.normalizedOutput).toBe('result');
  });

  it('throws when updating a non-existent record', async () => {
    await expect(
      service.updateStatus('00000000-0000-0000-0000-000000000000', { status: 'failed' }),
    ).rejects.toThrow();
  });
});
