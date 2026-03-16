/**
 * UnsupportedClaimMetric - Evaluates the presence of unsupported claims
 * (hallucination flags). Fewer flags yield a higher score.
 */

import type { MetricResult } from './AcceptanceMetric.js';

export interface UnsupportedClaimRecord {
  /** Number of unsupported claim / hallucination flags. */
  unsupportedClaimCount: number;
}

/**
 * Evaluates unsupported claims in an execution record.
 *
 * Score starts at 1.0 (no flags) and decreases by 0.25 per flag,
 * with a floor of 0.0.
 *
 * @param record - A record containing the unsupported claim count.
 * @returns A MetricResult with a score from 0.0 to 1.0.
 */
export function evaluateUnsupportedClaims(record: UnsupportedClaimRecord): MetricResult {
  const decrement = 0.25;
  const score = Math.max(0.0, 1.0 - record.unsupportedClaimCount * decrement);

  return {
    score,
    label: 'unsupported-claims',
    details: {
      unsupportedClaimCount: record.unsupportedClaimCount,
      decrementPerFlag: decrement,
    },
  };
}
