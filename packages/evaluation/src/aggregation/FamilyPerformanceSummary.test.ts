import { describe, it, expect } from 'vitest';
import { buildFamilyPerformanceSummary } from './FamilyPerformanceSummary.js';
import type { ExecutionScore } from '../scoring/ExecutionScoreCalculator.js';
import type { WindowStats } from './ExecutionHistoryAggregator.js';

function makeScore(
  compositeScore: number,
  metrics: Array<{ label: string; score: number }> = [],
): ExecutionScore {
  return {
    compositeScore,
    metricResults: metrics.map((m) => ({ ...m, details: {} })),
    resolvedWeights: {},
  };
}

describe('buildFamilyPerformanceSummary', () => {
  const baseStats: WindowStats = { mean: 0.6, stddev: 0.1, min: 0.3, max: 0.9, count: 3 };

  it('sets familyKey and rollingScore from stats.mean', () => {
    const summary = buildFamilyPerformanceSummary('app:proc:step', [], baseStats);
    expect(summary.familyKey).toBe('app:proc:step');
    expect(summary.rollingScore).toBe(0.6);
  });

  it('sets runCount from stats.count', () => {
    const summary = buildFamilyPerformanceSummary('k', [], baseStats);
    expect(summary.runCount).toBe(3);
  });

  it('counts recent failures (compositeScore < 0.3)', () => {
    const records = [makeScore(0.1), makeScore(0.5), makeScore(0.29)];
    const stats: WindowStats = { mean: 0.3, stddev: 0, min: 0.1, max: 0.5, count: 3 };
    const summary = buildFamilyPerformanceSummary('k', records, stats);
    expect(summary.recentFailureCount).toBe(2);
  });

  it('builds per-metric trends with mean and latest', () => {
    const records = [
      makeScore(0.5, [{ label: 'acceptance', score: 0.8 }]),
      makeScore(0.6, [{ label: 'acceptance', score: 0.6 }]),
    ];
    const stats: WindowStats = { mean: 0.55, stddev: 0, min: 0.5, max: 0.6, count: 2 };
    const summary = buildFamilyPerformanceSummary('k', records, stats);

    expect(summary.metricTrends).toHaveLength(1);
    expect(summary.metricTrends[0].label).toBe('acceptance');
    expect(summary.metricTrends[0].mean).toBeCloseTo(0.7);
    expect(summary.metricTrends[0].latest).toBe(0.6);
  });

  it('handles multiple metric labels across records', () => {
    const records = [
      makeScore(0.5, [
        { label: 'acceptance', score: 1.0 },
        { label: 'latency', score: 0.5 },
      ]),
      makeScore(0.6, [
        { label: 'acceptance', score: 0.8 },
        { label: 'latency', score: 0.7 },
      ]),
    ];
    const stats: WindowStats = { mean: 0.55, stddev: 0, min: 0.5, max: 0.6, count: 2 };
    const summary = buildFamilyPerformanceSummary('k', records, stats);
    expect(summary.metricTrends).toHaveLength(2);
    const labels = summary.metricTrends.map((t) => t.label);
    expect(labels).toContain('acceptance');
    expect(labels).toContain('latency');
  });

  it('returns empty metricTrends for records with no metrics', () => {
    const records = [makeScore(0.5)];
    const stats: WindowStats = { mean: 0.5, stddev: 0, min: 0.5, max: 0.5, count: 1 };
    const summary = buildFamilyPerformanceSummary('k', records, stats);
    expect(summary.metricTrends).toEqual([]);
  });

  it('sets lastUpdated to a recent Date', () => {
    const before = new Date();
    const summary = buildFamilyPerformanceSummary('k', [], baseStats);
    const after = new Date();
    expect(summary.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(summary.lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
