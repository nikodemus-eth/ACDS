import type { InvariantId } from './InvariantId.js';
import type { Cadence } from './Cadence.js';
import type { DefectReport } from './DefectReport.js';

/**
 * Status of a single invariant check.
 */
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * Result of evaluating a single invariant.
 */
export interface InvariantCheckResult {
  /** The invariant that was checked. */
  invariantId: InvariantId;

  /** Overall status of this invariant check. */
  status: CheckStatus;

  /** ISO-8601 timestamp of when the check was performed. */
  checkedAt: string;

  /** Duration of the check in milliseconds. */
  durationMs: number;

  /** Number of records/entities sampled during the check. */
  sampleSize: number;

  /** Defects found during this check. Empty if status is 'pass'. */
  defects: DefectReport[];

  /** Human-readable summary of the check outcome. */
  summary: string;
}

/**
 * Aggregated result from a single integrity checker module.
 */
export interface CheckerResult {
  /** Name of the checker that produced this result. */
  checkerName: string;

  /** The cadence under which this check ran. */
  cadence: Cadence;

  /** Results for each invariant the checker evaluates. */
  invariants: InvariantCheckResult[];
}
