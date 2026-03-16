/**
 * FamilyPerformanceSummary - Summarizes evaluation performance for an
 * execution family, including rolling scores and per-metric trends.
 */

import type { ExecutionScore } from '../scoring/ExecutionScoreCalculator.js';
import type { WindowStats } from './ExecutionHistoryAggregator.js';

export interface MetricTrend {
  /** The metric label. */
  label: string;
  /** Mean score for this metric across the window. */
  mean: number;
  /** Most recent score for this metric. */
  latest: number;
}

export interface FamilyPerformanceSummary {
  /** The family key (application:process:step). */
  familyKey: string;
  /** Rolling composite score (mean from the window). */
  rollingScore: number;
  /** Per-metric trend data. */
  metricTrends: MetricTrend[];
  /** Total number of runs in the window. */
  runCount: number;
  /** Number of recent failures (composite score below threshold). */
  recentFailureCount: number;
  /** Timestamp of the last update. */
  lastUpdated: Date;
}

/**
 * Failure threshold: composite scores below this are counted as failures.
 */
const FAILURE_THRESHOLD = 0.3;

/**
 * Builds a FamilyPerformanceSummary from aggregated execution data.
 *
 * @param familyKey - The family key identifier (e.g. "app:process:step").
 * @param records - The execution scores in the rolling window.
 * @param stats - Pre-computed window statistics.
 * @returns A FamilyPerformanceSummary.
 */
export function buildFamilyPerformanceSummary(
  familyKey: string,
  records: ExecutionScore[],
  stats: WindowStats,
): FamilyPerformanceSummary {
  // Collect per-metric scores across all records
  const metricScores = new Map<string, number[]>();

  for (const record of records) {
    for (const metric of record.metricResults) {
      let scores = metricScores.get(metric.label);
      if (!scores) {
        scores = [];
        metricScores.set(metric.label, scores);
      }
      scores.push(metric.score);
    }
  }

  // Build metric trends
  const metricTrends: MetricTrend[] = [];
  for (const [label, scores] of metricScores.entries()) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const latest = scores[scores.length - 1] ?? 0;
    metricTrends.push({ label, mean, latest });
  }

  // Count recent failures
  const recentFailureCount = records.filter(
    (r) => r.compositeScore < FAILURE_THRESHOLD,
  ).length;

  return {
    familyKey,
    rollingScore: stats.mean,
    metricTrends,
    runCount: stats.count,
    recentFailureCount,
    lastUpdated: new Date(),
  };
}
