import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';

export class InMemoryExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  private readonly records: ExecutionRecord[] = [];

  addRecord(record: ExecutionRecord): void {
    this.records.push(record);
  }

  async findById(id: string): Promise<ExecutionRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]> {
    const sinceDate = new Date(since);
    const untilDate = new Date(until);
    const matching = this.records.filter(
      (r) => r.createdAt >= sinceDate && r.createdAt <= untilDate,
    );
    return limit ? matching.slice(0, limit) : matching;
  }

  async findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]> {
    const matching = this.records.filter(
      (r) => `${r.executionFamily.application}/${r.executionFamily.process}/${r.executionFamily.step}` === familyKey,
    );
    return limit ? matching.slice(0, limit) : matching;
  }
}

const instance = new InMemoryExecutionRecordReadRepository();

export function getExecutionRecordReadRepository(): InMemoryExecutionRecordReadRepository {
  return instance;
}
