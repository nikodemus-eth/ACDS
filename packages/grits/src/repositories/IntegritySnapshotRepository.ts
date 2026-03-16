import type { IntegritySnapshot } from '../types/IntegritySnapshot.js';
import type { Cadence } from '../types/Cadence.js';

/**
 * Persistence interface for GRITS integrity snapshots.
 * This is the only repository where GRITS writes — it stores its own output.
 */
export interface IntegritySnapshotRepository {
  /** Persist a completed integrity snapshot. */
  save(snapshot: IntegritySnapshot): Promise<void>;

  /** Retrieve a snapshot by its unique ID. */
  findById(id: string): Promise<IntegritySnapshot | undefined>;

  /** Retrieve the most recent snapshot for a given cadence. */
  findLatestByCadence(cadence: Cadence): Promise<IntegritySnapshot | undefined>;

  /** Retrieve all snapshots within a time range (ISO-8601 strings). */
  findByTimeRange(since: string, until: string): Promise<IntegritySnapshot[]>;
}
