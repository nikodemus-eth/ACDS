import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';

/**
 * Read-only repository for adaptation rollback records.
 * GRITS uses this to verify rollback integrity and
 * state machine correctness.
 */
export interface AdaptationRollbackReadRepository {
  /** Retrieve all rollback records for a specific family. */
  findByFamily(familyKey: string): Promise<AdaptationRollbackRecord[]>;

  /** Retrieve a rollback record by its unique ID. */
  findById(id: string): Promise<AdaptationRollbackRecord | undefined>;
}
