import { describe, it, expect } from 'vitest';
import { buildImprovementSignal } from './ImprovementSignalBuilder.js';
import type { ExecutionScore } from './ExecutionScoreCalculator.js';

function makeScore(compositeScore: number): ExecutionScore {
  return { compositeScore, metricResults: [], resolvedWeights: {} };
}

describe('buildImprovementSignal', () => {
  it('returns stable with zero confidence for empty scores', () => {
    const signal = buildImprovementSignal([]);
    expect(signal.trend).toBe('stable');
    expect(signal.rollingAverage).toBe(0);
    expect(signal.sampleCount).toBe(0);
    expect(signal.confidence).toBe(0);
  });

  it('returns stable when fewer than 3 samples (insufficient for trend)', () => {
    const signal = buildImprovementSignal([makeScore(0.5), makeScore(0.9)]);
    expect(signal.trend).toBe('stable');
    expect(signal.sampleCount).toBe(2);
  });

  it('computes rolling average correctly', () => {
    const signal = buildImprovementSignal([makeScore(0.4), makeScore(0.6)]);
    expect(signal.rollingAverage).toBeCloseTo(0.5);
  });

  it('detects improving trend with ascending scores', () => {
    const scores = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9].map(makeScore);
    const signal = buildImprovementSignal(scores);
    expect(signal.trend).toBe('improving');
  });

  it('detects declining trend with descending scores', () => {
    const scores = [0.9, 0.7, 0.5, 0.3, 0.1].map(makeScore);
    const signal = buildImprovementSignal(scores);
    expect(signal.trend).toBe('declining');
  });

  it('detects stable trend with flat scores', () => {
    const scores = [0.5, 0.5, 0.5, 0.5, 0.5].map(makeScore);
    const signal = buildImprovementSignal(scores);
    expect(signal.trend).toBe('stable');
  });

  it('confidence increases with sample count, maxing at 1.0 at 30 samples', () => {
    const tenScores = Array.from({ length: 10 }, () => makeScore(0.5));
    const thirtyScores = Array.from({ length: 30 }, () => makeScore(0.5));
    const fiftyScores = Array.from({ length: 50 }, () => makeScore(0.5));

    expect(buildImprovementSignal(tenScores).confidence).toBeCloseTo(10 / 30);
    expect(buildImprovementSignal(thirtyScores).confidence).toBe(1.0);
    expect(buildImprovementSignal(fiftyScores).confidence).toBe(1.0);
  });
});
