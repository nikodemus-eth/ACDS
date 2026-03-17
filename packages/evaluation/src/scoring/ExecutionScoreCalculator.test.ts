import { describe, it, expect } from 'vitest';
import { calculateExecutionScore } from './ExecutionScoreCalculator.js';
import type { MetricResult } from '../metrics/AcceptanceMetric.js';

function makeMetric(label: string, score: number): MetricResult {
  return { label, score, details: {} };
}

describe('calculateExecutionScore', () => {
  it('returns compositeScore 0 for empty results', () => {
    const result = calculateExecutionScore([]);
    expect(result.compositeScore).toBe(0);
    expect(result.metricResults).toEqual([]);
    expect(result.resolvedWeights).toEqual({});
  });

  it('computes equal-weight average when no weights provided', () => {
    const results = [makeMetric('a', 0.8), makeMetric('b', 0.4)];
    const score = calculateExecutionScore(results);
    // equal weights: (0.8 + 0.4) / 2 = 0.6
    expect(score.compositeScore).toBeCloseTo(0.6);
  });

  it('applies custom weights and normalizes them', () => {
    const results = [makeMetric('a', 1.0), makeMetric('b', 0.0)];
    const score = calculateExecutionScore(results, { a: 3, b: 1 });
    // normalized: a=3/4=0.75, b=1/4=0.25
    // composite: 1.0*0.75 + 0.0*0.25 = 0.75
    expect(score.compositeScore).toBeCloseTo(0.75);
  });

  it('defaults missing weight to 1', () => {
    const results = [makeMetric('a', 1.0), makeMetric('b', 0.0)];
    // only provide weight for 'a'
    const score = calculateExecutionScore(results, { a: 1 });
    // both get weight 1, normalized to 0.5 each
    expect(score.compositeScore).toBeCloseTo(0.5);
  });

  it('preserves metricResults in the output', () => {
    const results = [makeMetric('x', 0.9)];
    const score = calculateExecutionScore(results);
    expect(score.metricResults).toHaveLength(1);
    expect(score.metricResults[0].label).toBe('x');
  });

  it('resolvedWeights sum to 1', () => {
    const results = [makeMetric('a', 0.5), makeMetric('b', 0.5), makeMetric('c', 0.5)];
    const score = calculateExecutionScore(results, { a: 2, b: 3, c: 5 });
    const sum = Object.values(score.resolvedWeights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it('handles single metric', () => {
    const score = calculateExecutionScore([makeMetric('solo', 0.7)]);
    expect(score.compositeScore).toBeCloseTo(0.7);
    expect(score.resolvedWeights['solo']).toBeCloseTo(1.0);
  });
});
