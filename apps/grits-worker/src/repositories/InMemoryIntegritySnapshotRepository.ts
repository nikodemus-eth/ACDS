import type { IntegritySnapshotRepository, IntegritySnapshot, Cadence } from '@acds/grits';

export class InMemoryIntegritySnapshotRepository implements IntegritySnapshotRepository {
  private readonly snapshots: IntegritySnapshot[] = [];

  async save(snapshot: IntegritySnapshot): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async findById(id: string): Promise<IntegritySnapshot | undefined> {
    return this.snapshots.find((s) => s.id === id);
  }

  async findLatestByCadence(cadence: Cadence): Promise<IntegritySnapshot | undefined> {
    const matching = this.snapshots
      .filter((s) => s.cadence === cadence)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return matching[0];
  }

  async findByTimeRange(since: string, until: string): Promise<IntegritySnapshot[]> {
    return this.snapshots.filter(
      (s) => s.completedAt >= since && s.completedAt <= until,
    );
  }
}

const instance = new InMemoryIntegritySnapshotRepository();

export function getIntegritySnapshotRepository(): IntegritySnapshotRepository {
  return instance;
}
