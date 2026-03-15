/**
 * ExecutionScoreCalculator - Computes a weighted composite score from
 * individual MetricResult values.
 */

import type { MetricResult } from '../metrics/AcceptanceMetric.js';

export interface WeightConfig {
  /** Map of metric label to its weight. Weights are normalized internally. */
  [metricLabel: string]: number;
}

export interface ExecutionScore {
  /** Weighted composite score between 0 and 1. */
  compositeScore: number;
  /** Individual metric results used in the calculation. */
  metricResults: MetricResult[];
  /** Resolved weights after normalization. */
  resolvedWeights: Record<string, number>;
}

/**
 * Calculates a weighted composite score from an array of MetricResults.
 *
 * If no weight config is provided, all metrics are weighted equally.
 * Metrics present in results but absent from weights receive a weight of 1.
 * Weights are normalized so they sum to 1.
 *
 * @param results - Array of MetricResult values.
 * @param weights - Optional weight configuration keyed by metric label.
 * @returns An ExecutionScore with the composite score and details.
 */
export function calculateExecutionScore(
  results: MetricResult[],
  weights: WeightConfig = {},
): ExecutionScore {
  if (results.length === 0) {
    return {
      compositeScore: 0,
      metricResults: [],
      resolvedWeights: {},
    };
  }

  // Assign weights: use provided weight or default to 1
  const rawWeights: Record<string, number> = {};
  for (const result of results) {
    rawWeights[result.label] = weights[result.label] ?? 1;
  }

  // Normalize weights to sum to 1
  const totalWeight = Object.values(rawWeights).reduce((sum, w) => sum + w, 0);
  const resolvedWeights: Record<string, number> = {};
  for (const [label, w] of Object.entries(rawWeights)) {
    resolvedWeights[label] = totalWeight > 0 ? w / totalWeight : 0;
  }

  // Calculate weighted composite
  let compositeScore = 0;
  for (const result of results) {
    compositeScore += result.score * (resolvedWeights[result.label] ?? 0);
  }

  return {
    compositeScore,
    metricResults: results,
    resolvedWeights,
  };
}
