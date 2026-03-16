import type { ExecutionRecord } from '@acds/core-types';

/**
 * Read-only repository for execution records.
 * GRITS uses this to verify execution integrity without
 * modifying any execution state.
 */
export interface ExecutionRecordReadRepository {
  /** Retrieve an execution record by its unique ID. */
  findById(id: string): Promise<ExecutionRecord | undefined>;

  /** Retrieve execution records within a time range (ISO-8601 strings). */
  findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]>;

  /** Retrieve execution records for a specific family. */
  findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]>;
}
