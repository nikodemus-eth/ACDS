/**
 * ARGUS-9 Tier 4 — Confidence Escalation Abuse
 *
 * Tests that ConfidenceEscalationResolver and evaluateAndTune accept
 * adversarial confidence values, reversed thresholds, and invalid grades.
 */

import { describe, it, expect } from 'vitest';
import { ConfidenceEscalationResolver } from '@acds/routing-engine';
import { CognitiveGrade } from '@acds/core-types';
import { evaluateAndTune } from '@acds/adaptive-optimizer';
import type { PerformanceSummaryForTuning } from '@acds/adaptive-optimizer';

describe('ARGUS: Confidence Escalation Abuse', () => {

  describe('ConfidenceEscalationResolver.resolve — threshold manipulation', () => {

    it('negative confidence resolves to FRONTIER — no bounds check', () => {
      // VULN: confidence < 0 always satisfies `< frontierThreshold(0.3)`
      const resolver = new ConfidenceEscalationResolver();
      expect(resolver.resolve(-0.5)).toBe(CognitiveGrade.FRONTIER);
    });

    it('confidence > 1.0 resolves to BASIC — never escalates', () => {
      // VULN: confidence 1.5 satisfies none of the `< threshold` checks
      const resolver = new ConfidenceEscalationResolver();
      expect(resolver.resolve(1.5)).toBe(CognitiveGrade.BASIC);
    });

    it('NaN confidence resolves to BASIC — all comparisons false', () => {
      // VULN: NaN < anything is always false → falls through to BASIC
      const resolver = new ConfidenceEscalationResolver();
      expect(resolver.resolve(NaN)).toBe(CognitiveGrade.BASIC);
    });

    it('reversed thresholds produce inverted grade mapping', () => {
      // VULN: no validation that frontierThreshold < enhancedThreshold < standardThreshold
      const resolver = new ConfidenceEscalationResolver({
        frontierThreshold: 0.8,
        enhancedThreshold: 0.6,
        standardThreshold: 0.3,
      });
      // confidence 0.5: not < 0.8? No, 0.5 < 0.8 → FRONTIER (should be ENHANCED with normal order)
      expect(resolver.resolve(0.5)).toBe(CognitiveGrade.FRONTIER);
      // confidence 0.7: 0.7 < 0.8 → FRONTIER (all medium confidence maps to FRONTIER)
      expect(resolver.resolve(0.7)).toBe(CognitiveGrade.FRONTIER);
    });

    it('all thresholds set to 0 — always returns BASIC (never escalates)', () => {
      // VULN: config disables all escalation
      const resolver = new ConfidenceEscalationResolver({
        frontierThreshold: 0,
        enhancedThreshold: 0,
        standardThreshold: 0,
      });
      // confidence 0.0: not < 0 → not < 0 → not < 0 → BASIC
      expect(resolver.resolve(0.0)).toBe(CognitiveGrade.BASIC);
    });

    it('all thresholds set to 1 — always returns FRONTIER (maximum escalation)', () => {
      // VULN: config forces maximum escalation for any confidence < 1.0
      const resolver = new ConfidenceEscalationResolver({
        frontierThreshold: 1,
        enhancedThreshold: 1,
        standardThreshold: 1,
      });
      expect(resolver.resolve(0.99)).toBe(CognitiveGrade.FRONTIER);
    });
  });

  describe('ConfidenceEscalationResolver.shouldEscalate — grade ordering', () => {

    it('unknown grade not in gradeOrder returns indexOf -1 — always escalates', () => {
      // VULN: unknown grade → indexOf returns -1 → any recommended grade > -1 is true
      const resolver = new ConfidenceEscalationResolver();
      expect(resolver.shouldEscalate(0.5, 'unknown_grade' as any)).toBe(true);
    });

    it('SPECIALIZED grade is at index 4 — never escalates beyond it', () => {
      const resolver = new ConfidenceEscalationResolver();
      // Even with very low confidence (FRONTIER = index 3), SPECIALIZED is index 4
      expect(resolver.shouldEscalate(0.1, CognitiveGrade.SPECIALIZED)).toBe(false);
    });

    it('BASIC with high confidence does not escalate', () => {
      const resolver = new ConfidenceEscalationResolver();
      // confidence 0.9 → BASIC → index 0, current BASIC → index 0, 0 > 0 = false
      expect(resolver.shouldEscalate(0.9, CognitiveGrade.BASIC)).toBe(false);
    });
  });

  describe('evaluateAndTune — constraint abuse', () => {

    const baseSummary: PerformanceSummaryForTuning = {
      rollingScore: 0.6,
      recentTrend: 'stable',
      recentLocalFailures: 0,
      recentEscalatedSuccesses: 0,
      recentExecutionCount: 100,
    };

    it('forcedEscalation always returns early_escalate regardless of summary', () => {
      // Not a bug — but documenting that forced escalation ignores ALL performance data
      const result = evaluateAndTune('fam', baseSummary, {
        posture: 'exploratory',
        forcedEscalation: true,
        minConfidenceThreshold: 0.99,
      });
      expect(result.preference).toBe('early_escalate');
      expect(result.confidence).toBe(1.0);
    });

    it('minConfidenceThreshold > 1.0 forces normal_escalate always', () => {
      // VULN: threshold > 1.0 means confidence (max 0.9) is always below → always normal
      const result = evaluateAndTune('fam', {
        ...baseSummary,
        recentLocalFailures: 50, // high failure rate → would trigger early_escalate
      }, {
        posture: 'advisory',
        forcedEscalation: false,
        minConfidenceThreshold: 2.0,
      });
      // confidence would be ~0.9, but 0.9 < 2.0 → falls back to normal
      expect(result.preference).toBe('normal_escalate');
      expect(result.confidence).toBe(2.0); // confidence set to threshold value — > 1.0!
    });

    it('negative minConfidenceThreshold never triggers fallback', () => {
      // VULN: any computed confidence > -1 → fallback never fires
      const result = evaluateAndTune('fam', {
        ...baseSummary,
        recentLocalFailures: 50,
      }, {
        posture: 'advisory',
        forcedEscalation: false,
        minConfidenceThreshold: -1,
      });
      expect(result.preference).toBe('early_escalate');
    });

    it('recentExecutionCount: 0 produces 0 rates — no division error', () => {
      const result = evaluateAndTune('fam', {
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 0,
        recentExecutionCount: 0,
      }, {
        posture: 'advisory',
        forcedEscalation: false,
        minConfidenceThreshold: 0.5,
      });
      // Both rates default to 0, escalatedSuccessRate(0) < 0.2 AND not declining
      // → delayed_escalate with confidence 0.6
      expect(result.preference).toBe('delayed_escalate');
    });

    it('recentLocalFailures > recentExecutionCount — rate > 1.0', () => {
      // VULN: no validation that failures <= total executions
      const result = evaluateAndTune('fam', {
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 200,
        recentEscalatedSuccesses: 0,
        recentExecutionCount: 100,
      }, {
        posture: 'advisory',
        forcedEscalation: false,
        minConfidenceThreshold: 0.5,
      });
      // localFailureRate = 200/100 = 2.0 ≥ 0.3 → early_escalate
      // confidence = Math.min(0.9, 0.5 + 2.0) = 0.9
      expect(result.preference).toBe('early_escalate');
    });
  });
});
