/**
 * CostMetric - Evaluates execution cost, normalized to a 0-1 score
 * where lower cost yields a higher score.
 */

import type { MetricResult } from './AcceptanceMetric.js';

export interface CostRecord {
  /** Estimated cost of the execution. */
  costEstimate: number | null;
}

export interface CostThresholds {
  /** Cost at or below which the score is 1.0. Default: 0.001. */
  idealCost: number;
  /** Cost at or above which the score is 0.0. Default: 0.10. */
  maxCost: number;
}

const DEFAULT_THRESHOLDS: CostThresholds = {
  idealCost: 0.001,
  maxCost: 0.10,
};

/**
 * Evaluates cost of an execution record, normalized to a 0-1 score.
 *
 * @param record - A record containing costEstimate.
 * @param thresholds - Optional configurable thresholds for ideal and max cost.
 * @returns A MetricResult with a linearly interpolated score between 0.0 and 1.0.
 */
export function evaluateCost(
  record: CostRecord,
  thresholds: Partial<CostThresholds> = {},
): MetricResult {
  const { idealCost, maxCost } = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (record.costEstimate === null || record.costEstimate === undefined) {
    return {
      score: 0.0,
      label: 'cost',
      details: {
        costEstimate: null,
        reason: 'No cost data available',
        idealCost,
        maxCost,
      },
    };
  }

  let score: number;
  if (record.costEstimate <= idealCost) {
    score = 1.0;
  } else if (record.costEstimate >= maxCost) {
    score = 0.0;
  } else {
    score = 1.0 - (record.costEstimate - idealCost) / (maxCost - idealCost);
  }

  return {
    score,
    label: 'cost',
    details: {
      costEstimate: record.costEstimate,
      idealCost,
      maxCost,
    },
  };
}
