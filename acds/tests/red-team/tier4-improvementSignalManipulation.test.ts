/**
 * ARGUS-9 Tier 4 — Improvement Signal & Aggregation Manipulation
 *
 * Tests that buildImprovementSignal accepts adversarial score sequences
 * that corrupt linear regression, produce NaN slopes, and game trend detection.
 */

import { describe, it, expect } from 'vitest';
import { buildImprovementSignal } from '@acds/evaluation';
import type { ExecutionScore } from '@acds/evaluation';

function makeScore(composite: number): ExecutionScore {
  return {
    compositeScore: composite,
    metricResults: [],
    resolvedWeights: {},
  };
}

describe('ARGUS: Improvement Signal Manipulation', () => {

  describe('buildImprovementSignal — adversarial inputs', () => {

    it('empty scores array returns stable with 0 confidence', () => {
      const signal = buildImprovementSignal([]);
      expect(signal.trend).toBe('stable');
      expect(signal.confidence).toBe(0);
      expect(signal.rollingAverage).toBe(0);
    });

    it('single score returns stable (below MIN_SAMPLES_FOR_TREND)', () => {
      const signal = buildImprovementSignal([makeScore(0.8)]);
      expect(signal.trend).toBe('stable');
      expect(signal.sampleCount).toBe(1);
    });

    it('two scores returns stable (below MIN_SAMPLES_FOR_TREND)', () => {
      const signal = buildImprovementSignal([makeScore(0.2), makeScore(0.9)]);
      expect(signal.trend).toBe('stable');
    });

    it('NaN composite score produces NaN rollingAverage', () => {
      // VULN: NaN propagates through regression
      const signal = buildImprovementSignal([
        makeScore(NaN),
        makeScore(NaN),
        makeScore(NaN),
      ]);
      expect(isNaN(signal.rollingAverage)).toBe(true);
    });

    it('Infinity composite score produces Infinity rollingAverage', () => {
      // VULN: Infinity accepted
      const signal = buildImprovementSignal([
        makeScore(Infinity),
        makeScore(Infinity),
        makeScore(Infinity),
      ]);
      expect(signal.rollingAverage).toBe(Infinity);
    });

    it('scores > 1.0 produce inflated average and manipulated trend', () => {
      // VULN: no bounds check — scores outside [0,1] accepted
      const signal = buildImprovementSignal([
        makeScore(5.0),
        makeScore(10.0),
        makeScore(15.0),
      ]);
      expect(signal.rollingAverage).toBe(10.0);
      expect(signal.trend).toBe('improving');
    });

    it('negative scores produce negative average', () => {
      // VULN: no bounds check on scores
      const signal = buildImprovementSignal([
        makeScore(-5.0),
        makeScore(-10.0),
        makeScore(-15.0),
      ]);
      expect(signal.rollingAverage).toBe(-10.0);
      expect(signal.trend).toBe('declining');
    });

    it('constant scores produce stable trend regardless of value', () => {
      // Correct behavior: flat line has slope 0
      const signal = buildImprovementSignal([
        makeScore(0.5),
        makeScore(0.5),
        makeScore(0.5),
      ]);
      expect(signal.trend).toBe('stable');
    });

    it('exactly at SLOPE_THRESHOLD boundary classified as improving due to float precision', () => {
      // VULN: floating point precision means slope "exactly at" 0.02 may be
      // 0.020000000000000004 due to IEEE 754 arithmetic, making it > 0.02
      // This means the boundary is unpredictable for precise threshold values
      const signal = buildImprovementSignal([
        makeScore(0.0),
        makeScore(0.02),
        makeScore(0.04),
      ]);
      // Mathematical slope = 0.02 exactly, but float arithmetic makes it > 0.02
      expect(signal.trend).toBe('improving');
    });

    it('just above SLOPE_THRESHOLD is classified as improving', () => {
      const signal = buildImprovementSignal([
        makeScore(0.0),
        makeScore(0.025),
        makeScore(0.05),
      ]);
      // slope = 0.025 > 0.02 → improving
      expect(signal.trend).toBe('improving');
    });

    it('30 samples produce confidence 1.0', () => {
      const scores = Array.from({ length: 30 }, (_, i) => makeScore(0.5 + i * 0.001));
      const signal = buildImprovementSignal(scores);
      expect(signal.confidence).toBe(1.0);
      expect(signal.sampleCount).toBe(30);
    });

    it('100 samples still produce confidence 1.0 (capped)', () => {
      const scores = Array.from({ length: 100 }, () => makeScore(0.5));
      const signal = buildImprovementSignal(scores);
      expect(signal.confidence).toBe(1.0);
    });

    it('mixed NaN and valid scores produce NaN slope', () => {
      // VULN: single NaN in sequence corrupts entire regression
      const signal = buildImprovementSignal([
        makeScore(0.5),
        makeScore(NaN),
        makeScore(0.7),
      ]);
      expect(isNaN(signal.rollingAverage)).toBe(true);
    });
  });
});
