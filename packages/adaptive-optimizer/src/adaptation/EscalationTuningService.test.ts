import { describe, it, expect } from 'vitest';
import { evaluateAndTune, type PerformanceSummaryForTuning, type PolicyConstraints } from './EscalationTuningService.js';

function makeSummary(overrides: Partial<PerformanceSummaryForTuning> = {}): PerformanceSummaryForTuning {
  return {
    rollingScore: 0.6,
    recentTrend: 'stable',
    recentLocalFailures: 0,
    recentEscalatedSuccesses: 0,
    recentExecutionCount: 100,
    ...overrides,
  };
}

function makeConstraints(overrides: Partial<PolicyConstraints> = {}): PolicyConstraints {
  return {
    posture: 'advisory',
    forcedEscalation: false,
    minConfidenceThreshold: 0.3,
    ...overrides,
  };
}

describe('evaluateAndTune', () => {
  describe('forced escalation', () => {
    it('returns early_escalate with confidence 1.0 when forcedEscalation is true', () => {
      const result = evaluateAndTune('fam:test', makeSummary(), makeConstraints({ forcedEscalation: true }));
      expect(result.preference).toBe('early_escalate');
      expect(result.confidence).toBe(1.0);
      expect(result.familyKey).toBe('fam:test');
      expect(result.lastEvaluatedAt).toBeTruthy();
    });
  });

  describe('high local failure rate (>= 0.3)', () => {
    it('returns early_escalate when local failure rate is 0.3', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        recentLocalFailures: 30,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('early_escalate');
      // confidence = min(0.9, 0.5 + 0.3) = 0.8
      expect(result.confidence).toBe(0.8);
    });

    it('returns early_escalate when local failure rate is 0.5', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        recentLocalFailures: 50,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('early_escalate');
      // confidence = min(0.9, 0.5 + 0.5) = 0.9
      expect(result.confidence).toBe(0.9);
    });

    it('caps confidence at 0.9 when failure rate is very high', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        recentLocalFailures: 90,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('early_escalate');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('strong local performance (local_preferred_until_fail)', () => {
    it('returns local_preferred when score >= 0.75, not declining, no failures', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.8,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('local_preferred_until_fail');
      // confidence = min(0.9, 0.5 + (0.8 - 0.5)) = min(0.9, 0.8) = 0.8
      expect(result.confidence).toBe(0.8);
    });

    it('returns local_preferred when trend is improving', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.75,
        recentTrend: 'improving',
        recentLocalFailures: 0,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('local_preferred_until_fail');
    });

    it('does not return local_preferred when trend is declining', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.8,
        recentTrend: 'declining',
        recentLocalFailures: 0,
        recentExecutionCount: 100,
      }), makeConstraints());
      // Declining + low rolling score doesn't apply (0.8 >= 0.4), so falls to escalatedSuccessRate branch or normal
      expect(result.preference).not.toBe('local_preferred_until_fail');
    });

    it('does not return local_preferred when there are local failures', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.8,
        recentTrend: 'stable',
        recentLocalFailures: 5, // > 0 failures but rate < 0.3
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).not.toBe('local_preferred_until_fail');
    });
  });

  describe('declining trend with low rolling score', () => {
    it('returns early_escalate when declining and score < 0.4', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.35,
        recentTrend: 'declining',
        recentLocalFailures: 0,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('early_escalate');
      expect(result.confidence).toBe(0.7);
    });

    it('does not trigger when score >= 0.4', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.4,
        recentTrend: 'declining',
        recentLocalFailures: 0,
        recentExecutionCount: 100,
      }), makeConstraints());
      // Score is exactly 0.4, which is not < 0.4, so this branch doesn't fire
      expect(result.preference).not.toBe('early_escalate');
    });
  });

  describe('low escalation success rate (delayed_escalate)', () => {
    it('returns delayed_escalate when escalated success rate < 0.2 and not declining', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 10, // 10/100 = 0.1 < 0.2
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('delayed_escalate');
      expect(result.confidence).toBe(0.6);
    });

    it('does not return delayed_escalate when trend is declining', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.6,
        recentTrend: 'declining',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 10,
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).not.toBe('delayed_escalate');
    });

    it('does not return delayed_escalate when escalated success rate >= 0.2', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 20,
        recentExecutionCount: 100,
      }), makeConstraints());
      // 20/100 = 0.2, not < 0.2
      expect(result.preference).toBe('normal_escalate');
    });
  });

  describe('default normal_escalate', () => {
    it('returns normal_escalate when no specific condition triggers', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 5, // rate = 0.05 < 0.3
        recentEscalatedSuccesses: 25, // rate = 0.25 >= 0.2
        recentExecutionCount: 100,
      }), makeConstraints());
      expect(result.preference).toBe('normal_escalate');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('zero execution count', () => {
    it('handles zero executions (localFailureRate=0, escalatedSuccessRate=0)', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        recentExecutionCount: 0,
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 0,
        rollingScore: 0.6,
        recentTrend: 'stable',
      }), makeConstraints());
      // localFailureRate=0, escalatedSuccessRate=0 < 0.2, not declining => delayed_escalate
      expect(result.preference).toBe('delayed_escalate');
    });
  });

  describe('confidence threshold gating', () => {
    it('falls back to normal_escalate when confidence < minConfidenceThreshold', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 0,
        recentExecutionCount: 100,
      }), makeConstraints({ minConfidenceThreshold: 0.8 }));
      // Would be delayed_escalate with confidence 0.6, but 0.6 < 0.8
      expect(result.preference).toBe('normal_escalate');
      expect(result.confidence).toBe(0.8);
    });

    it('does not override when confidence >= minConfidenceThreshold', () => {
      const result = evaluateAndTune('fam:test', makeSummary({
        recentLocalFailures: 30,
        recentExecutionCount: 100,
      }), makeConstraints({ minConfidenceThreshold: 0.5 }));
      // early_escalate with confidence 0.8 >= 0.5
      expect(result.preference).toBe('early_escalate');
      expect(result.confidence).toBe(0.8);
    });
  });

  it('always includes familyKey and lastEvaluatedAt', () => {
    const result = evaluateAndTune('my:family', makeSummary(), makeConstraints());
    expect(result.familyKey).toBe('my:family');
    expect(new Date(result.lastEvaluatedAt).getTime()).not.toBeNaN();
  });
});
