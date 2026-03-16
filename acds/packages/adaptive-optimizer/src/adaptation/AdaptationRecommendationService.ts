/**
 * AdaptationRecommendationService - Generates adaptation recommendations
 * when the optimizer is in recommend_only or auto_apply mode and needs
 * human approval.
 *
 * Recommendations are created when plateau signals or ranking shifts
 * indicate that an adaptation may be beneficial, but the current mode
 * does not permit automatic application.
 */

import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { PlateauSignal } from '../plateau/PlateauSignal.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';

export type RecommendationStatus = 'pending' | 'approved' | 'rejected';

export interface AdaptationRecommendation {
  /** Unique identifier for this recommendation. */
  id: string;

  /** The execution family this recommendation applies to. */
  familyKey: string;

  /** The recommended candidate ranking to apply. */
  recommendedRanking: RankedCandidate[];

  /** Evidence supporting the recommendation (human-readable). */
  evidence: string;

  /** Current status of the recommendation. */
  status: RecommendationStatus;

  /** ISO-8601 timestamp of when this recommendation was created. */
  createdAt: string;
}

export interface GenerateRecommendationParams {
  id: string;
  familyKey: string;
  plateauSignal: PlateauSignal;
  rankingSnapshot: RankedCandidate[];
  familyState: FamilySelectionState;
  mode: AdaptiveMode;
}

/**
 * Builds a human-readable evidence summary from the plateau signal
 * and ranking data.
 */
function buildEvidence(
  plateauSignal: PlateauSignal,
  rankingSnapshot: RankedCandidate[],
  familyState: FamilySelectionState,
): string {
  const parts: string[] = [];

  if (plateauSignal.detected) {
    parts.push(`Plateau detected (severity: ${plateauSignal.severity}).`);
    const active = Object.entries(plateauSignal.indicators)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (active.length > 0) {
      parts.push(`Active indicators: ${active.join(', ')}.`);
    }
  }

  parts.push(`Family trend: ${familyState.recentTrend}, rolling score: ${familyState.rollingScore.toFixed(4)}.`);

  if (rankingSnapshot.length > 0) {
    const top = rankingSnapshot[0];
    parts.push(
      `Top candidate: ${top.candidate.candidateId} (score: ${top.compositeScore.toFixed(4)}, runs: ${top.candidate.runCount}).`,
    );
  }

  return parts.join(' ');
}

/**
 * Generates an adaptation recommendation when the optimizer mode requires
 * human review before applying changes.
 *
 * Returns undefined if the mode does not warrant a recommendation
 * (e.g., observe_only or fully_applied with no approval needed).
 *
 * @param params - All inputs needed to generate the recommendation.
 * @returns An AdaptationRecommendation, or undefined if not applicable.
 */
export function generateRecommendation(
  params: GenerateRecommendationParams,
): AdaptationRecommendation | undefined {
  const { id, familyKey, plateauSignal, rankingSnapshot, familyState, mode } = params;

  // Only generate recommendations for modes that involve human review
  if (mode === 'observe_only' || mode === 'fully_applied') {
    return undefined;
  }

  // For auto_apply_low_risk, only generate a recommendation if
  // the plateau signal is moderate or severe (needs human approval)
  if (mode === 'auto_apply_low_risk') {
    if (!plateauSignal.detected || plateauSignal.severity === 'mild') {
      return undefined;
    }
  }

  const evidence = buildEvidence(plateauSignal, rankingSnapshot, familyState);

  return {
    id,
    familyKey,
    recommendedRanking: rankingSnapshot,
    evidence,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}
