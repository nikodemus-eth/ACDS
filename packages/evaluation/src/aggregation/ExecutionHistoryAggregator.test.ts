import { describe, it, expect } from 'vitest';
import { ExecutionHistoryAggregator } from './ExecutionHistoryAggregator.js';
import type { ExecutionScore } from '../scoring/ExecutionScoreCalculator.js';

function makeScore(compositeScore: number): ExecutionScore {
  return { compositeScore, metricResults: [], resolvedWeights: {} };
}

describe('ExecutionHistoryAggregator', () => {
  it('starts with empty window', () => {
    const agg = new ExecutionHistoryAggregator();
    expect(agg.getWindow()).toEqual([]);
  });

  it('adds records to the window', () => {
    const agg = new ExecutionHistoryAggregator();
    agg.addRecord(makeScore(0.8));
    agg.addRecord(makeScore(0.6));
    expect(agg.getWindow()).toHaveLength(2);
  });

  it('evicts oldest record when window is full', () => {
    const agg = new ExecutionHistoryAggregator(3);
    agg.addRecord(makeScore(0.1));
    agg.addRecord(makeScore(0.2));
    agg.addRecord(makeScore(0.3));
    agg.addRecord(makeScore(0.4));
    const window = agg.getWindow();
    expect(window).toHaveLength(3);
    expect(window[0].compositeScore).toBe(0.2);
    expect(window[2].compositeScore).toBe(0.4);
  });

  it('getWindow returns a copy (not the internal array)', () => {
    const agg = new ExecutionHistoryAggregator();
    agg.addRecord(makeScore(0.5));
    const w1 = agg.getWindow();
    const w2 = agg.getWindow();
    expect(w1).not.toBe(w2);
    expect(w1).toEqual(w2);
  });

  describe('getStats', () => {
    it('returns zeroes for empty window', () => {
      const agg = new ExecutionHistoryAggregator();
      const stats = agg.getStats();
      expect(stats).toEqual({ mean: 0, stddev: 0, min: 0, max: 0, count: 0 });
    });

    it('computes correct stats for a single record', () => {
      const agg = new ExecutionHistoryAggregator();
      agg.addRecord(makeScore(0.7));
      const stats = agg.getStats();
      expect(stats.mean).toBeCloseTo(0.7);
      expect(stats.stddev).toBe(0);
      expect(stats.min).toBeCloseTo(0.7);
      expect(stats.max).toBeCloseTo(0.7);
      expect(stats.count).toBe(1);
    });

    it('computes correct mean, min, max', () => {
      const agg = new ExecutionHistoryAggregator();
      agg.addRecord(makeScore(0.2));
      agg.addRecord(makeScore(0.4));
      agg.addRecord(makeScore(0.6));
      agg.addRecord(makeScore(0.8));
      const stats = agg.getStats();
      expect(stats.mean).toBeCloseTo(0.5);
      expect(stats.min).toBeCloseTo(0.2);
      expect(stats.max).toBeCloseTo(0.8);
      expect(stats.count).toBe(4);
    });

    it('computes population standard deviation', () => {
      const agg = new ExecutionHistoryAggregator();
      // scores: 0.0 and 1.0 -> mean=0.5, variance=0.25, stddev=0.5
      agg.addRecord(makeScore(0.0));
      agg.addRecord(makeScore(1.0));
      const stats = agg.getStats();
      expect(stats.stddev).toBeCloseTo(0.5);
    });
  });
});
