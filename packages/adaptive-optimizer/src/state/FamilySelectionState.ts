/**
 * FamilySelectionState - Tracks the adaptive selection state for an execution family.
 *
 * Each execution family maintains a rolling view of which candidate
 * (model+tactic+provider combination) is currently selected, how well
 * it is performing, and whether a plateau has been detected.
 */

/** Indicates the recent performance direction for this family. */
export type RecentTrend = 'improving' | 'stable' | 'declining';

export interface FamilySelectionState {
  /** Unique key identifying the execution family (e.g. app:process:step). */
  familyKey: string;

  /** The candidateId currently selected for this family. */
  currentCandidateId: string;

  /** Exponentially-weighted rolling quality score (0-1). */
  rollingScore: number;

  /**
   * Current exploration rate (0-1).
   * Higher values increase the likelihood of trying alternative candidates.
   */
  explorationRate: number;

  /** Whether a performance plateau has been detected for this family. */
  plateauDetected: boolean;

  /** ISO-8601 timestamp of the last adaptation event applied to this family. */
  lastAdaptationAt: string;

  /** Recent performance trend direction. */
  recentTrend: RecentTrend;
}
