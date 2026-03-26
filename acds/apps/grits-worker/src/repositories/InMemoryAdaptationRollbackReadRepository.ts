import type { AdaptationRollbackReadRepository } from '@acds/grits';
import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';

export class InMemoryAdaptationRollbackReadRepository implements AdaptationRollbackReadRepository {
  private readonly records: AdaptationRollbackRecord[] = [];

  addRecord(record: AdaptationRollbackRecord): void {
    this.records.push(record);
  }

  async findByFamily(familyKey: string): Promise<AdaptationRollbackRecord[]> {
    return this.records.filter((r) => r.familyKey === familyKey);
  }

  async findById(id: string): Promise<AdaptationRollbackRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }
}
