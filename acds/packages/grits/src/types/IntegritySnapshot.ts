import type { Cadence } from './Cadence.js';
import type { InvariantCheckResult } from './CheckerResult.js';

/**
 * Overall system health indicator.
 */
export type OverallStatus =
  | 'green'  // All invariants pass
  | 'yellow' // Warnings but no failures
  | 'red';   // At least one invariant failed

/**
 * Defect counts by severity level.
 */
export interface DefectCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/**
 * A point-in-time assessment of system integrity.
 */
export interface IntegritySnapshot {
  /** Unique identifier for this snapshot. */
  id: string;

  /** The cadence that produced this snapshot. */
  cadence: Cadence;

  /** ISO-8601 timestamp when the integrity run started. */
  startedAt: string;

  /** ISO-8601 timestamp when the integrity run completed. */
  completedAt: string;

  /** Total duration of the integrity run in milliseconds. */
  totalDurationMs: number;

  /** Results for each invariant checked. */
  results: InvariantCheckResult[];

  /** Overall system health indicator. */
  overallStatus: OverallStatus;

  /** Rolled-up defect counts by severity. */
  defectCount: DefectCounts;
}
