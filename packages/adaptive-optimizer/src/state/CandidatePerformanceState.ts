/**
 * CandidatePerformanceState - Tracks the performance of a single candidate
 * (model profile + tactic profile + provider) within an execution family.
 *
 * The candidateId is a composite key derived from modelProfileId, tacticProfileId,
 * and providerId, ensuring each unique combination is tracked independently.
 */

export interface CandidatePerformanceState {
  /**
   * Composite identifier: `${modelProfileId}:${tacticProfileId}:${providerId}`.
   * Uniquely identifies a candidate configuration.
   */
  candidateId: string;

  /** The execution family this candidate belongs to. */
  familyKey: string;

  /** Exponentially-weighted rolling quality score (0-1). */
  rollingScore: number;

  /** Total number of runs executed by this candidate. */
  runCount: number;

  /** Success rate as a ratio (0-1). */
  successRate: number;

  /** Average response latency in milliseconds. */
  averageLatency: number;

  /** ISO-8601 timestamp of the last time this candidate was selected. */
  lastSelectedAt: string;
}

/**
 * Builds a composite candidateId from its constituent identifiers.
 */
export function buildCandidateId(
  modelProfileId: string,
  tacticProfileId: string,
  providerId: string,
): string {
  return `${modelProfileId}:${tacticProfileId}:${providerId}`;
}
