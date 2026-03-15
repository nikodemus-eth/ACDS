/**
 * AdaptiveCandidatePortfolioBuilder - Converts eligible profiles, tactics,
 * and provider options into CandidatePerformanceState[] for one execution family.
 *
 * Each combination of (modelProfile + tactic + provider) = one candidate.
 * Existing state is merged when available; new candidates receive default values.
 */

import type { ModelProfile, TacticProfile } from '@acds/core-types';
import type { CandidatePerformanceState } from '@acds/adaptive-optimizer';
import { buildCandidateId } from '@acds/adaptive-optimizer';

export interface PortfolioBuildInputs {
  /** The execution family key (e.g. "app:process:step"). */
  familyKey: string;

  /** Eligible model profiles for this request. */
  eligibleProfiles: ModelProfile[];

  /** Eligible tactic profiles for this request. */
  eligibleTactics: TacticProfile[];

  /** Map from profileId to providerId. */
  profileProviderMap: Map<string, string>;

  /** Existing candidate performance states (from optimizer state). */
  existingCandidateStates: CandidatePerformanceState[];
}

/** Default values for a newly-discovered candidate with no history. */
const DEFAULT_ROLLING_SCORE = 0.5;
const DEFAULT_SUCCESS_RATE = 1.0;
const DEFAULT_AVERAGE_LATENCY = 0;

/**
 * Builds a candidate portfolio from all eligible combinations of
 * profile + tactic + provider. Merges with existing performance state
 * when available; creates new default state entries for unseen combos.
 *
 * @param inputs - All inputs needed to build the portfolio.
 * @returns An array of CandidatePerformanceState, one per valid combination.
 */
export function buildCandidatePortfolio(
  inputs: PortfolioBuildInputs,
): CandidatePerformanceState[] {
  const { familyKey, eligibleProfiles, eligibleTactics, profileProviderMap, existingCandidateStates } = inputs;

  // Index existing candidates by candidateId for fast lookup
  const existingMap = new Map<string, CandidatePerformanceState>();
  for (const state of existingCandidateStates) {
    existingMap.set(state.candidateId, state);
  }

  const candidates: CandidatePerformanceState[] = [];

  for (const profile of eligibleProfiles) {
    const providerId = profileProviderMap.get(profile.id);
    if (!providerId) {
      // Skip profiles without a mapped provider
      continue;
    }

    for (const tactic of eligibleTactics) {
      const candidateId = buildCandidateId(profile.id, tactic.id, providerId);

      const existing = existingMap.get(candidateId);
      if (existing) {
        candidates.push(existing);
      } else {
        candidates.push({
          candidateId,
          familyKey,
          rollingScore: DEFAULT_ROLLING_SCORE,
          runCount: 0,
          successRate: DEFAULT_SUCCESS_RATE,
          averageLatency: DEFAULT_AVERAGE_LATENCY,
          lastSelectedAt: new Date(0).toISOString(),
        });
      }
    }
  }

  return candidates;
}
