import type { ExecutionRecord } from '@acds/core-types';
import type { ExecutionRecordReadRepository } from '@acds/grits';

/**
 * Real in-memory implementation of ExecutionRecordReadRepository for tests.
 * No mocks — stores records in a plain array with real filtering logic.
 */
export class InMemoryExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  private records: ExecutionRecord[];

  constructor(seed: ExecutionRecord[] = []) {
    this.records = seed.map((r) => ({ ...r }));
  }

  async findById(id: string): Promise<ExecutionRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]> {
    const sinceDate = new Date(since).getTime();
    const untilDate = new Date(until).getTime();
    const filtered = this.records.filter((r) => {
      const t = r.createdAt.getTime();
      return t >= sinceDate && t <= untilDate;
    });
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]> {
    const filtered = this.records.filter((r) => {
      const fk = `${r.executionFamily.application}/${r.executionFamily.process}/${r.executionFamily.step}`;
      return fk === familyKey;
    });
    return limit ? filtered.slice(0, limit) : filtered;
  }
}
