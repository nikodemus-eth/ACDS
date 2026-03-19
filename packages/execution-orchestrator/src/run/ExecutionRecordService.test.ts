import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRecordService } from './ExecutionRecordService.js';
import type { ExecutionRecordRepository, ExecutionRecordFilters } from './ExecutionRecordService.js';
import {
  CognitiveGrade,
  DecisionPosture,
  type ExecutionRecord,
} from '@acds/core-types';

// In-memory repository implementing the real interface
class InMemoryExecutionRecordRepository implements ExecutionRecordRepository {
  private records: ExecutionRecord[] = [];
  private nextId = 1;

  async create(record: Omit<ExecutionRecord, 'id'>): Promise<ExecutionRecord> {
    const withId: ExecutionRecord = { ...record, id: `rec-${this.nextId++}` };
    this.records.push(withId);
    return withId;
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async findByFamily(familyKey: string, limit = 50): Promise<ExecutionRecord[]> {
    return this.records
      .filter((r) => r.executionFamily.application === familyKey)
      .slice(0, limit);
  }

  async findRecent(limit = 50): Promise<ExecutionRecord[]> {
    return this.records.slice(-limit);
  }

  async findFiltered(filters: ExecutionRecordFilters): Promise<ExecutionRecord[]> {
    let results = [...this.records];
    if (filters.status) {
      results = results.filter((r) => r.status === filters.status);
    }
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }
    return results;
  }

  async update(id: string, updates: Partial<Omit<ExecutionRecord, 'id'>>): Promise<ExecutionRecord> {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error(`Record ${id} not found`);
    Object.assign(record, updates);
    return record;
  }
}

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
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

describe('ExecutionRecordService', () => {
  let repo: InMemoryExecutionRecordRepository;
  let service: ExecutionRecordService;

  beforeEach(() => {
    repo = new InMemoryExecutionRecordRepository();
    service = new ExecutionRecordService(repo);
  });

  it('creates a record and assigns an id', async () => {
    const record = await service.create(makeRecord());

    expect(record.id).toBe('rec-1');
    expect(record.status).toBe('pending');
  });

  it('retrieves a record by id', async () => {
    const created = await service.create(makeRecord());
    const found = await service.getById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('returns null for non-existent id', async () => {
    const found = await service.getById('non-existent');
    expect(found).toBeNull();
  });

  it('retrieves records by family', async () => {
    await service.create(makeRecord());
    await service.create(makeRecord());

    const results = await service.getByFamily('TestApp');
    expect(results).toHaveLength(2);
  });

  it('uses default limit of 50 for getByFamily', async () => {
    await service.create(makeRecord());
    const results = await service.getByFamily('TestApp');
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
      service.updateStatus('non-existent', { status: 'failed' }),
    ).rejects.toThrow('Record non-existent not found');
  });
});
