/**
 * ARGUS-9 Tier 4 — Evaluation Metric Manipulation
 *
 * Tests that evaluation metrics and score calculation accept adversarial
 * inputs: unrecognized outcomes, negative weights, NaN/Infinity propagation,
 * and edge latency values.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateAcceptance,
  evaluateLatency,
  calculateExecutionScore,
} from '@acds/evaluation';
import type { MetricResult } from '@acds/evaluation';

describe('ARGUS D4, F15: Evaluation Manipulation', () => {

  describe('evaluateAcceptance — unrecognized outcomes', () => {

    it('produces score 0.0 for unrecognized acceptance value — no error', () => {
      // VULN: unknown acceptance falls through to ?? 0.0 silently
      const result = evaluateAcceptance({ acceptance: 'unknown' as any });
      expect(result.score).toBe(0.0);
      expect(result.label).toBe('acceptance');
    });

    it('produces score 0.0 for empty string acceptance', () => {
      // VULN: empty string is not a valid AcceptanceOutcome but is accepted
      const result = evaluateAcceptance({ acceptance: '' as any });
      expect(result.score).toBe(0.0);
    });
  });

  describe('evaluateLatency — edge values', () => {

    it('produces score 1.0 for latencyMs: 0', () => {
      // 0 <= idealMs(500) → score 1.0
      const result = evaluateLatency({ latencyMs: 0 });
      expect(result.score).toBe(1.0);
    });

    it('produces score > 1.0 for negative latencyMs', () => {
      // VULN: negative latency is not rejected
      // -100 <= idealMs(500) → score 1.0 (clamped by the <= check)
      const result = evaluateLatency({ latencyMs: -100 });
      expect(result.score).toBe(1.0);
    });

    it('produces score 0.0 for null latencyMs', () => {
      const result = evaluateLatency({ latencyMs: null });
      expect(result.score).toBe(0.0);
    });

    it('accepts reversed thresholds — idealMs > maxMs', () => {
      // VULN: no validation that idealMs < maxMs
      const result = evaluateLatency({ latencyMs: 5000 }, { idealMs: 10000, maxMs: 500 });
      // 5000 is between maxMs(500) and idealMs(10000)
      // 5000 > maxMs(500) → score = 0.0? No, 5000 <= idealMs(10000) → score 1.0
      expect(result.score).toBe(1.0);
    });
  });

  describe('calculateExecutionScore — weight manipulation', () => {

    it('negative weights cause totalWeight <= 0 — all resolved to 0', () => {
      // VULN: negative weights make totalWeight negative → totalWeight > 0 is false
      // → all resolvedWeights become 0 → compositeScore becomes 0
      // This silently discards all scoring when any negative weight dominates
      const results: MetricResult[] = [
        { score: 1.0, label: 'acceptance', details: {} },
        { score: 0.8, label: 'latency', details: {} },
      ];
      const score = calculateExecutionScore(results, {
        acceptance: -2,
        latency: 1,
      });
      // totalWeight = -2 + 1 = -1, -1 > 0 is false → all weights → 0
      expect(score.compositeScore).toBe(0);
    });

    it('negative weight with positive sum produces inverted contribution', () => {
      // VULN: when totalWeight is positive but one weight is negative,
      // that metric's contribution is inverted — higher score lowers composite
      const results: MetricResult[] = [
        { score: 1.0, label: 'good', details: {} },
        { score: 1.0, label: 'bad', details: {} },
      ];
      const score = calculateExecutionScore(results, {
        good: 3,
        bad: -1,
      });
      // totalWeight = 3 + (-1) = 2
      // good: 3/2 = 1.5, bad: -1/2 = -0.5
      // composite = 1.0 * 1.5 + 1.0 * (-0.5) = 1.0
      expect(score.compositeScore).toBeCloseTo(1.0);
    });

    it('produces 0 composite when all weights are 0', () => {
      // Edge case: all zero weights → totalWeight=0 → all resolved to 0
      const results: MetricResult[] = [
        { score: 1.0, label: 'acceptance', details: {} },
      ];
      const score = calculateExecutionScore(results, { acceptance: 0 });
      expect(score.compositeScore).toBe(0);
    });

    it('NaN weight silently produces 0 composite', () => {
      // VULN: NaN weight → NaN totalWeight → totalWeight > 0 is false → resolvedWeight=0
      const results: MetricResult[] = [
        { score: 0.8, label: 'test', details: {} },
      ];
      const score = calculateExecutionScore(results, { test: NaN });
      expect(score.compositeScore).toBe(0);
    });

    it('Infinity weight produces NaN composite', () => {
      // VULN: Infinity/Infinity = NaN → composite becomes NaN
      const results: MetricResult[] = [
        { score: 0.5, label: 'a', details: {} },
        { score: 0.5, label: 'b', details: {} },
      ];
      const score = calculateExecutionScore(results, { a: Infinity, b: Infinity });
      // Infinity + Infinity = Infinity, Infinity/Infinity = NaN
      expect(isNaN(score.compositeScore)).toBe(true);
    });

    it('single metric with default weight returns the metric score', () => {
      const results: MetricResult[] = [
        { score: 0.7, label: 'only', details: {} },
      ];
      const score = calculateExecutionScore(results);
      // Default weight 1 → normalized to 1.0 → composite = 0.7 * 1.0
      expect(score.compositeScore).toBeCloseTo(0.7);
    });

    it('empty results array returns 0 composite', () => {
      const score = calculateExecutionScore([]);
      expect(score.compositeScore).toBe(0);
      expect(score.metricResults).toHaveLength(0);
    });

    it('score > 1.0 passes through unclamped', () => {
      // VULN: no bounds checking on metric scores
      const results: MetricResult[] = [
        { score: 5.0, label: 'inflated', details: {} },
      ];
      const score = calculateExecutionScore(results);
      expect(score.compositeScore).toBe(5.0);
    });
  });
});
