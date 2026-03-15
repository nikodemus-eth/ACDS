/**
 * AdaptiveSelectionService - Orchestrates candidate selection for an
 * execution family, combining ranking, exploration, and exploitation
 * policies under configurable adaptive modes.
 */

import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import { rankCandidates, type RankedCandidate } from './CandidateRanker.js';
import { shouldExplore } from './ExplorationPolicy.js';
import { selectExploitation } from './ExploitationPolicy.js';

/**
 * Controls how aggressively the optimizer applies its selections.
 *
 * - observe_only: Logs ranking data but does not change the current candidate.
 * - recommend_only: Computes a recommendation but does not apply it.
 * - auto_apply_low_risk: Applies the selection automatically for low-consequence families.
 * - fully_applied: Always applies the optimizer's selection.
 */
export type AdaptiveMode =
  | 'observe_only'
  | 'recommend_only'
  | 'auto_apply_low_risk'
  | 'fully_applied';

export interface AdaptiveSelectionResult {
  /** The candidate that was selected (or the current one, in observe_only mode). */
  selectedCandidate: RankedCandidate;

  /** Human-readable reason for the selection. */
  selectionReason: string;

  /** Whether exploration was used for this selection. */
  explorationUsed: boolean;

  /** Full ranking snapshot at the time of selection. */
  rankingSnapshot: RankedCandidate[];
}

/**
 * Selects a random non-top candidate for exploration purposes.
 */
function selectExploration(ranked: RankedCandidate[]): RankedCandidate {
  if (ranked.length <= 1) {
    return ranked[0];
  }
  // Pick a random candidate that is not the top-ranked
  const alternatives = ranked.slice(1);
  const index = Math.floor(Math.random() * alternatives.length);
  return alternatives[index];
}

/**
 * Performs adaptive candidate selection for an execution family.
 *
 * @param familyKey - The execution family key.
 * @param eligibleCandidates - All eligible candidate performance states.
 * @param familyState - The current family selection state.
 * @param _candidateStates - Full candidate states (available for extended logic).
 * @param mode - The adaptive mode controlling how selections are applied.
 * @returns The selection result including the chosen candidate and reasoning.
 */
export function select(
  familyKey: string,
  eligibleCandidates: CandidatePerformanceState[],
  familyState: FamilySelectionState,
  _candidateStates: CandidatePerformanceState[],
  mode: AdaptiveMode,
): AdaptiveSelectionResult {
  if (eligibleCandidates.length === 0) {
    throw new Error(`No eligible candidates for family '${familyKey}'.`);
  }

  // Rank all eligible candidates
  const ranked = rankCandidates(eligibleCandidates, familyState);

  // In observe_only mode, return the current candidate without changes
  if (mode === 'observe_only') {
    const current =
      ranked.find((r) => r.candidate.candidateId === familyState.currentCandidateId) ??
      ranked[0];
    return {
      selectedCandidate: current,
      selectionReason: `Observe-only mode: current candidate retained (${current.candidate.candidateId}).`,
      explorationUsed: false,
      rankingSnapshot: ranked,
    };
  }

  // In recommend_only mode, compute ranking but mark as recommendation only
  if (mode === 'recommend_only') {
    const top = selectExploitation(ranked);
    return {
      selectedCandidate: top,
      selectionReason: `Recommendation: top-ranked candidate is ${top.candidate.candidateId} (score: ${top.compositeScore.toFixed(4)}). Not applied.`,
      explorationUsed: false,
      rankingSnapshot: ranked,
    };
  }

  // auto_apply_low_risk and fully_applied: apply selection with exploration
  const exploring = shouldExplore(familyState);

  if (exploring && ranked.length > 1) {
    const explored = selectExploration(ranked);
    return {
      selectedCandidate: explored,
      selectionReason: `Exploration: selected alternative candidate ${explored.candidate.candidateId} (rank ${explored.rank}, score: ${explored.compositeScore.toFixed(4)}).`,
      explorationUsed: true,
      rankingSnapshot: ranked,
    };
  }

  const exploited = selectExploitation(ranked);
  return {
    selectedCandidate: exploited,
    selectionReason: `Exploitation: selected top-ranked candidate ${exploited.candidate.candidateId} (score: ${exploited.compositeScore.toFixed(4)}).`,
    explorationUsed: false,
    rankingSnapshot: ranked,
  };
}
