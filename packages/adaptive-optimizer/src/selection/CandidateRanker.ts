/**
 * CandidateRanker - Ranks candidates within an execution family by composite score.
 *
 * Scoring factors:
 *  - Rolling performance score (primary weight)
 *  - Recency bonus (candidates selected more recently get a small boost)
 *  - Success rate bonus
 */

import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';

export interface RankedCandidate {
  /** The underlying candidate performance state. */
  candidate: CandidatePerformanceState;

  /** Composite ranking score (higher is better). */
  compositeScore: number;

  /** Rank position (1 = best). */
  rank: number;

  /** Breakdown of how the composite score was calculated. */
  scoreBreakdown: {
    performanceComponent: number;
    recencyComponent: number;
    successRateComponent: number;
  };
}

export interface RankerWeights {
  /** Weight for rolling performance score (default 0.6). */
  performanceWeight: number;
  /** Weight for recency bonus (default 0.15). */
  recencyWeight: number;
  /** Weight for success rate (default 0.25). */
  successRateWeight: number;
  /** Half-life for recency decay in milliseconds (default 24 hours). */
  recencyHalfLifeMs: number;
}

const DEFAULT_WEIGHTS: RankerWeights = {
  performanceWeight: 0.6,
  recencyWeight: 0.15,
  successRateWeight: 0.25,
  recencyHalfLifeMs: 24 * 60 * 60 * 1000,
};

/**
 * Computes a recency bonus between 0 and 1 based on how recently the
 * candidate was last selected, using exponential decay.
 */
function computeRecencyBonus(lastSelectedAt: string, halfLifeMs: number): number {
  const elapsed = Date.now() - new Date(lastSelectedAt).getTime();
  if (elapsed <= 0) return 1.0;
  return Math.pow(0.5, elapsed / halfLifeMs);
}

/**
 * Ranks candidates by a weighted composite of rolling performance,
 * recency, and success rate. Returns a sorted array (best first).
 *
 * @param candidates - All candidate performance states for the family.
 * @param _familyState - The current family selection state (available for future use).
 * @param weights - Optional custom weights for scoring components.
 */
export function rankCandidates(
  candidates: CandidatePerformanceState[],
  _familyState: FamilySelectionState,
  weights: Partial<RankerWeights> = {},
): RankedCandidate[] {
  const w: RankerWeights = { ...DEFAULT_WEIGHTS, ...weights };

  const scored = candidates.map((candidate) => {
    const performanceComponent = candidate.rollingScore;
    const recencyComponent = computeRecencyBonus(candidate.lastSelectedAt, w.recencyHalfLifeMs);
    const successRateComponent = candidate.successRate;

    const compositeScore =
      w.performanceWeight * performanceComponent +
      w.recencyWeight * recencyComponent +
      w.successRateWeight * successRateComponent;

    return {
      candidate,
      compositeScore,
      rank: 0, // assigned after sorting
      scoreBreakdown: {
        performanceComponent,
        recencyComponent,
        successRateComponent,
      },
    };
  });

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // Assign ranks (1-based)
  return scored.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}
