import type { InvariantId } from './InvariantId.js';
import type { CheckStatus } from './CheckerResult.js';
import type { DefectReport } from './DefectReport.js';

/**
 * Direction of change for an invariant between two snapshots.
 */
export type DriftDirection = 'improved' | 'degraded' | 'unchanged';

/**
 * Drift analysis for a single invariant.
 */
export interface InvariantDrift {
  /** The invariant being compared. */
  invariantId: InvariantId;

  /** Status in the previous snapshot. */
  previousStatus: CheckStatus;

  /** Status in the current snapshot. */
  currentStatus: CheckStatus;

  /** Whether integrity improved, degraded, or stayed the same. */
  direction: DriftDirection;

  /** Defects present in current but not in previous. */
  newDefects: DefectReport[];

  /** Defects present in previous but resolved in current. */
  resolvedDefects: DefectReport[];
}

/**
 * Comparison between two IntegritySnapshots showing what changed.
 */
export interface DriftReport {
  /** Unique identifier for this drift report. */
  id: string;

  /** The snapshot used as baseline. */
  previousSnapshotId: string;

  /** The snapshot being compared against baseline. */
  currentSnapshotId: string;

  /** ISO-8601 timestamp when this report was generated. */
  generatedAt: string;

  /** Per-invariant drift analysis. */
  drifts: InvariantDrift[];

  /** Net direction of change across all invariants. */
  netDirection: DriftDirection;
}
