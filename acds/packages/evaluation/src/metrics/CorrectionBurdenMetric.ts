/**
 * CorrectionBurdenMetric - Evaluates how many corrections were needed
 * for an execution. Fewer corrections yield a higher score.
 */

import type { MetricResult } from './AcceptanceMetric.js';

export interface CorrectionRecord {
  /** Number of corrections applied to the execution result. */
  correctionCount: number;
}

/**
 * Evaluates the correction burden of an execution record.
 *
 * Score starts at 1.0 (no corrections) and decreases by 0.2 per correction,
 * with a floor of 0.0.
 *
 * @param record - A record containing the correction count.
 * @returns A MetricResult with a score from 0.0 to 1.0.
 */
export function evaluateCorrectionBurden(record: CorrectionRecord): MetricResult {
  const decrement = 0.2;
  const score = Math.max(0.0, 1.0 - record.correctionCount * decrement);

  return {
    score,
    label: 'correction-burden',
    details: {
      correctionCount: record.correctionCount,
      decrementPerCorrection: decrement,
    },
  };
}
