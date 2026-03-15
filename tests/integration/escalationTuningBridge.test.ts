// ---------------------------------------------------------------------------
// Integration Tests – Escalation Tuning Bridge (Prompt 68)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  evaluateAndTune,
  type PerformanceSummaryForTuning,
  type PolicyConstraints,
} from '@acds/adaptive-optimizer';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSummary(
  overrides?: Partial<PerformanceSummaryForTuning>,
): PerformanceSummaryForTuning {
  return {
    rollingScore: 0.75,
    recentTrend: 'stable',
    recentLocalFailures: 0,
    recentEscalatedSuccesses: 5,
    recentExecutionCount: 50,
    ...overrides,
  };
}

function makeConstraints(overrides?: Partial<PolicyConstraints>): PolicyConstraints {
  return {
    posture: 'advisory',
    forcedEscalation: false,
    minConfidenceThreshold: 0.3,
    ...overrides,
  };
}

// ===========================================================================
// Tuned Preferences Translated to Staged Decisions
// ===========================================================================

describe('Escalation Tuning – Preferences from Performance Data', () => {
  it('returns local_preferred_until_fail for high-scoring stable families', () => {
    const result = evaluateAndTune(
      'family.strong.local',
      makeSummary({ rollingScore: 0.85, recentTrend: 'stable', recentLocalFailures: 0 }),
      makeConstraints(),
    );

    expect(result.familyKey).toBe('family.strong.local');
    expect(result.preference).toBe('local_preferred_until_fail');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns early_escalate for families with high local failure rates', () => {
    const result = evaluateAndTune(
      'family.failing.local',
      makeSummary({
        rollingScore: 0.5,
        recentTrend: 'declining',
        recentLocalFailures: 20,
        recentExecutionCount: 50,
      }),
      makeConstraints(),
    );

    expect(result.preference).toBe('early_escalate');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns early_escalate for declining trend with low rolling score', () => {
    const result = evaluateAndTune(
      'family.declining',
      makeSummary({
        rollingScore: 0.35,
        recentTrend: 'declining',
        recentLocalFailures: 2,
        recentExecutionCount: 50,
      }),
      makeConstraints(),
    );

    expect(result.preference).toBe('early_escalate');
  });

  it('returns normal_escalate as default for moderate performance', () => {
    const result = evaluateAndTune(
      'family.moderate',
      makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 5,
        recentEscalatedSuccesses: 10,
        recentExecutionCount: 50,
      }),
      makeConstraints(),
    );

    expect(result.preference).toBe('normal_escalate');
  });

  it('includes lastEvaluatedAt timestamp', () => {
    const result = evaluateAndTune('family.test', makeSummary(), makeConstraints());

    expect(result.lastEvaluatedAt).toBeDefined();
    const parsed = new Date(result.lastEvaluatedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });
});

// ===========================================================================
// Policy Hard Stops Preserved
// ===========================================================================

describe('Escalation Tuning – Policy Hard Stops', () => {
  it('always returns early_escalate when forcedEscalation is true', () => {
    const result = evaluateAndTune(
      'family.final',
      makeSummary({ rollingScore: 0.95, recentTrend: 'improving', recentLocalFailures: 0 }),
      makeConstraints({ posture: 'final', forcedEscalation: true }),
    );

    expect(result.preference).toBe('early_escalate');
    expect(result.confidence).toBe(1.0);
  });

  it('ignores strong local performance when escalation is forced', () => {
    const result = evaluateAndTune(
      'family.evidentiary',
      makeSummary({
        rollingScore: 0.99,
        recentTrend: 'improving',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 0,
        recentExecutionCount: 100,
      }),
      makeConstraints({ posture: 'evidentiary', forcedEscalation: true }),
    );

    // Even with perfect local performance, forced escalation overrides
    expect(result.preference).toBe('early_escalate');
    expect(result.confidence).toBe(1.0);
  });

  it('falls back to normal_escalate when confidence is below threshold', () => {
    // Use a high confidence threshold to force fallback
    const result = evaluateAndTune(
      'family.low.confidence',
      makeSummary({
        rollingScore: 0.6,
        recentTrend: 'stable',
        recentLocalFailures: 3,
        recentEscalatedSuccesses: 10,
        recentExecutionCount: 50,
      }),
      makeConstraints({ minConfidenceThreshold: 0.95 }),
    );

    expect(result.preference).toBe('normal_escalate');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('does not override forced escalation even with high confidence threshold', () => {
    const result = evaluateAndTune(
      'family.forced.high.threshold',
      makeSummary(),
      makeConstraints({ forcedEscalation: true, minConfidenceThreshold: 0.99 }),
    );

    expect(result.preference).toBe('early_escalate');
    expect(result.confidence).toBe(1.0);
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('Escalation Tuning – Edge Cases', () => {
  it('handles zero execution count gracefully', () => {
    const result = evaluateAndTune(
      'family.new',
      makeSummary({
        rollingScore: 0.5,
        recentTrend: 'stable',
        recentLocalFailures: 0,
        recentEscalatedSuccesses: 0,
        recentExecutionCount: 0,
      }),
      makeConstraints(),
    );

    // With zero executions, rates are 0, should get a reasonable default
    expect(result.preference).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns a valid EscalationTuningState shape', () => {
    const result = evaluateAndTune('family.shape', makeSummary(), makeConstraints());

    expect(result).toHaveProperty('familyKey', 'family.shape');
    expect(result).toHaveProperty('preference');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('lastEvaluatedAt');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
