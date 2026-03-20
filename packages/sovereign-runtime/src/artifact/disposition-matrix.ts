import type { ProviderDisposition } from './artifact-envelope.js';
import type { ProviderScore } from '../domain/score-types.js';

// ---------------------------------------------------------------------------
// Provider Disposition Matrix
// ---------------------------------------------------------------------------

const APPLE_PROVIDER_ID = 'apple-intelligence-runtime';
const APPLE_SCORE_BOOST = 0.2;

/**
 * Applies provider disposition rules to scored candidates.
 *
 * - apple-only: reject all non-Apple providers
 * - apple-preferred: boost Apple score by 0.2, keep others
 * - apple-optional: no adjustment
 */
export function applyDisposition(
  disposition: ProviderDisposition,
  scores: ProviderScore[],
): ProviderScore[] {
  if (scores.length === 0) return [];

  switch (disposition) {
    case 'apple-only':
      return scores.filter(s => s.providerId === APPLE_PROVIDER_ID);

    case 'apple-preferred': {
      return scores
        .map(s => {
          if (s.providerId === APPLE_PROVIDER_ID) {
            return {
              ...s,
              totalScore: Math.min(1.0, s.totalScore + APPLE_SCORE_BOOST),
              localityScore: Math.min(1.0, s.localityScore + APPLE_SCORE_BOOST),
            };
          }
          return s;
        })
        .sort((a, b) => b.totalScore - a.totalScore);
    }

    case 'apple-optional':
      return scores;
  }
}

/**
 * Checks if a provider is eligible under the given disposition.
 */
export function isProviderEligible(
  disposition: ProviderDisposition,
  providerId: string,
): boolean {
  if (disposition === 'apple-only') {
    return providerId === APPLE_PROVIDER_ID;
  }
  return true;
}

/**
 * Returns the Apple provider ID constant for use in disposition checks.
 */
export function getAppleProviderId(): string {
  return APPLE_PROVIDER_ID;
}
