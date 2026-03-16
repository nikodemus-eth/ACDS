// ---------------------------------------------------------------------------
// Integration Tests – Evaluation Scoring (Prompt 59)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types for the evaluation scoring domain
// ---------------------------------------------------------------------------

/** A single metric evaluation returning a normalized 0-1 score. */
interface MetricScore {
  metric: string;
  value: number; // 0..1
}

/** Weights applied to each metric for a weighted composite score. */
interface MetricWeights {
  [metric: string]: number;
}

/** Trend signal produced by analyzing a window of scores. */
type TrendDirection = 'improving' | 'stable' | 'declining';

interface ImprovementSignal {
  direction: TrendDirection;
  delta: number; // absolute change between first and last window averages
}

// ---------------------------------------------------------------------------
// Mock scoring functions (simulate @acds/adaptive-scoring)
// ---------------------------------------------------------------------------

function scoreMetric(metric: string, rawValue: number, maxValue: number): MetricScore {
  const clamped = Math.max(0, Math.min(rawValue / maxValue, 1));
  return { metric, value: parseFloat(clamped.toFixed(4)) };
}

function computeWeightedScore(scores: MetricScore[], weights: MetricWeights): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const s of scores) {
    const w = weights[s.metric] ?? 0;
    weightedSum += s.value * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return parseFloat((weightedSum / totalWeight).toFixed(4));
}

function applicationWeights(application: string): MetricWeights {
  if (application === 'thingstead') {
    return { quality: 0.5, latency: 0.2, cost: 0.15, reliability: 0.15 };
  }
  if (application === 'process-swarm') {
    return { quality: 0.25, latency: 0.35, cost: 0.25, reliability: 0.15 };
  }
  // Default even weights
  return { quality: 0.25, latency: 0.25, cost: 0.25, reliability: 0.25 };
}

function detectImprovementSignal(recentScores: number[]): ImprovementSignal {
  if (recentScores.length < 4) {
    return { direction: 'stable', delta: 0 };
  }
  const mid = Math.floor(recentScores.length / 2);
  const firstHalf = recentScores.slice(0, mid);
  const secondHalf = recentScores.slice(mid);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const delta = parseFloat((secondAvg - firstAvg).toFixed(4));

  if (delta > 0.02) return { direction: 'improving', delta };
  if (delta < -0.02) return { direction: 'declining', delta };
  return { direction: 'stable', delta };
}

// ===========================================================================
// Metric Scoring Tests
// ===========================================================================

describe('Evaluation Scoring – Metric Scoring', () => {
  it('returns 0-1 for a metric at minimum value', () => {
    const result = scoreMetric('quality', 0, 100);
    expect(result.value).toBe(0);
  });

  it('returns 0-1 for a metric at maximum value', () => {
    const result = scoreMetric('quality', 100, 100);
    expect(result.value).toBe(1);
  });

  it('returns 0-1 for a metric at mid value', () => {
    const result = scoreMetric('latency', 50, 100);
    expect(result.value).toBe(0.5);
  });

  it('clamps values above maximum to 1', () => {
    const result = scoreMetric('cost', 150, 100);
    expect(result.value).toBe(1);
  });

  it('clamps negative values to 0', () => {
    const result = scoreMetric('reliability', -10, 100);
    expect(result.value).toBe(0);
  });

  it('includes the metric name in the result', () => {
    const result = scoreMetric('quality', 80, 100);
    expect(result.metric).toBe('quality');
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// Weighted Score Calculation Tests
// ===========================================================================

describe('Evaluation Scoring – Weighted Score Calculation', () => {
  it('applies custom weights correctly', () => {
    const scores: MetricScore[] = [
      { metric: 'quality', value: 1.0 },
      { metric: 'latency', value: 0.0 },
    ];
    const weights: MetricWeights = { quality: 0.8, latency: 0.2 };

    const composite = computeWeightedScore(scores, weights);
    expect(composite).toBeCloseTo(0.8, 2);
  });

  it('returns 0 when all weights are zero', () => {
    const scores: MetricScore[] = [
      { metric: 'quality', value: 0.9 },
      { metric: 'latency', value: 0.7 },
    ];
    const weights: MetricWeights = { quality: 0, latency: 0 };

    const composite = computeWeightedScore(scores, weights);
    expect(composite).toBe(0);
  });

  it('returns perfect score when all metrics are 1.0', () => {
    const scores: MetricScore[] = [
      { metric: 'quality', value: 1.0 },
      { metric: 'latency', value: 1.0 },
      { metric: 'cost', value: 1.0 },
    ];
    const weights: MetricWeights = { quality: 0.5, latency: 0.3, cost: 0.2 };

    const composite = computeWeightedScore(scores, weights);
    expect(composite).toBe(1);
  });

  it('ignores metrics not present in weights', () => {
    const scores: MetricScore[] = [
      { metric: 'quality', value: 0.9 },
      { metric: 'unknown', value: 0.1 },
    ];
    const weights: MetricWeights = { quality: 1.0 };

    const composite = computeWeightedScore(scores, weights);
    expect(composite).toBeCloseTo(0.9, 2);
  });
});

// ===========================================================================
// Application-Specific Weights Tests
// ===========================================================================

describe('Evaluation Scoring – Application-Specific Weights', () => {
  it('Thingstead emphasizes quality (highest weight)', () => {
    const weights = applicationWeights('thingstead');

    expect(weights.quality).toBeGreaterThan(weights.latency);
    expect(weights.quality).toBeGreaterThan(weights.cost);
    expect(weights.quality).toBeGreaterThan(weights.reliability);
  });

  it('Process Swarm emphasizes latency (highest weight)', () => {
    const weights = applicationWeights('process-swarm');

    expect(weights.latency).toBeGreaterThan(weights.quality);
    expect(weights.latency).toBeGreaterThan(weights.cost);
    expect(weights.latency).toBeGreaterThan(weights.reliability);
  });

  it('Thingstead and Process Swarm have different emphasis', () => {
    const thingstead = applicationWeights('thingstead');
    const processSwarm = applicationWeights('process-swarm');

    expect(thingstead.quality).toBeGreaterThan(processSwarm.quality);
    expect(processSwarm.latency).toBeGreaterThan(thingstead.latency);
  });

  it('weights sum to 1.0 for all known applications', () => {
    for (const app of ['thingstead', 'process-swarm', 'unknown-app']) {
      const weights = applicationWeights(app);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    }
  });
});

// ===========================================================================
// Improvement Signal Tests
// ===========================================================================

describe('Evaluation Scoring – Improvement Signal', () => {
  it('detects improving trend when scores increase over time', () => {
    const scores = [0.5, 0.52, 0.55, 0.58, 0.62, 0.65, 0.68, 0.72];
    const signal = detectImprovementSignal(scores);

    expect(signal.direction).toBe('improving');
    expect(signal.delta).toBeGreaterThan(0);
  });

  it('detects stable trend when scores are flat', () => {
    const scores = [0.7, 0.71, 0.69, 0.7, 0.71, 0.7, 0.7, 0.71];
    const signal = detectImprovementSignal(scores);

    expect(signal.direction).toBe('stable');
  });

  it('detects declining trend when scores decrease over time', () => {
    const scores = [0.8, 0.78, 0.75, 0.72, 0.68, 0.65, 0.62, 0.58];
    const signal = detectImprovementSignal(scores);

    expect(signal.direction).toBe('declining');
    expect(signal.delta).toBeLessThan(0);
  });

  it('returns stable for insufficient data points', () => {
    const signal = detectImprovementSignal([0.5, 0.6]);

    expect(signal.direction).toBe('stable');
    expect(signal.delta).toBe(0);
  });
});
