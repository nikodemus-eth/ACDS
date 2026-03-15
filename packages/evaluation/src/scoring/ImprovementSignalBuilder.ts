/**
 * ImprovementSignalBuilder - Analyzes recent execution scores to produce
 * a trend signal indicating whether performance is improving, stable, or declining.
 */

import type { ExecutionScore } from './ExecutionScoreCalculator.js';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface ImprovementSignal {
  /** The detected trend direction. */
  trend: TrendDirection;
  /** Rolling average of composite scores. */
  rollingAverage: number;
  /** Number of samples used in the analysis. */
  sampleCount: number;
  /** Confidence level 0-1, increases with sample count. */
  confidence: number;
}

/**
 * Minimum number of scores needed to determine a trend.
 */
const MIN_SAMPLES_FOR_TREND = 3;

/**
 * Threshold for the slope to be considered non-stable.
 * Slopes within [-threshold, +threshold] are "stable".
 */
const SLOPE_THRESHOLD = 0.02;

/**
 * Maximum sample count at which confidence reaches 1.0.
 */
const MAX_CONFIDENCE_SAMPLES = 30;

/**
 * Builds an improvement signal from a series of recent execution scores.
 *
 * Uses simple linear regression on composite scores to detect trend direction.
 *
 * @param scores - Recent ExecutionScore records, ordered chronologically (oldest first).
 * @returns An ImprovementSignal describing the trend.
 */
export function buildImprovementSignal(scores: ExecutionScore[]): ImprovementSignal {
  const sampleCount = scores.length;
  const confidence = Math.min(1.0, sampleCount / MAX_CONFIDENCE_SAMPLES);

  if (sampleCount === 0) {
    return {
      trend: 'stable',
      rollingAverage: 0,
      sampleCount: 0,
      confidence: 0,
    };
  }

  const compositeScores = scores.map((s) => s.compositeScore);
  const rollingAverage =
    compositeScores.reduce((sum, v) => sum + v, 0) / sampleCount;

  if (sampleCount < MIN_SAMPLES_FOR_TREND) {
    return {
      trend: 'stable',
      rollingAverage,
      sampleCount,
      confidence,
    };
  }

  // Simple linear regression: y = mx + b
  // x = index, y = composite score
  const n = sampleCount;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += compositeScores[i];
    sumXY += i * compositeScores[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  let trend: TrendDirection;
  if (slope > SLOPE_THRESHOLD) {
    trend = 'improving';
  } else if (slope < -SLOPE_THRESHOLD) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  return {
    trend,
    rollingAverage,
    sampleCount,
    confidence,
  };
}
