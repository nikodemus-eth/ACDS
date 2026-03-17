import { describe, it, expect } from 'vitest';
import { translateTuning } from './StagedEscalationPolicyBridge.js';
import type { StagedPolicyConstraints } from './StagedEscalationPolicyBridge.js';

function makeTuningState(overrides: Record<string, unknown> = {}) {
  return {
    familyKey: 'app:process:step',
    preference: 'normal_escalate' as const,
    confidence: 0.85,
    lastEvaluatedAt: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

describe('translateTuning', () => {
  it('returns tuned preference when no policy override is needed', () => {
    const constraints: StagedPolicyConstraints = { forcedEscalation: false };
    const result = translateTuning(makeTuningState(), constraints);

    expect(result.familyKey).toBe('app:process:step');
    expect(result.escalationPreference).toBe('normal_escalate');
    expect(result.policyOverride).toBe(false);
    expect(result.reason).toContain('Tuned preference: normal_escalate');
    expect(result.reason).toContain('0.85');
    expect(result.decidedAt).toBeTruthy();
  });

  it('forces early_escalate when forcedEscalation is true', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: true,
      posture: 'final',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'delayed_escalate' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('early_escalate');
    expect(result.policyOverride).toBe(true);
    expect(result.reason).toContain('Forced escalation');
    expect(result.reason).toContain("posture 'final'");
  });

  it('uses unknown posture when forcedEscalation is true but posture is not provided', () => {
    const constraints: StagedPolicyConstraints = { forcedEscalation: true };
    const result = translateTuning(makeTuningState(), constraints);

    expect(result.escalationPreference).toBe('early_escalate');
    expect(result.policyOverride).toBe(true);
    expect(result.reason).toContain("posture 'unknown'");
  });

  it('clamps preference when it exceeds maxPermittedPreference', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'normal_escalate',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'local_preferred_until_fail' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('normal_escalate');
    expect(result.policyOverride).toBe(true);
    expect(result.reason).toContain("clamped to 'normal_escalate'");
  });

  it('does not clamp when preference is within permitted range', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'delayed_escalate',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'early_escalate' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('early_escalate');
    expect(result.policyOverride).toBe(false);
  });

  it('does not clamp when preference equals the max', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'delayed_escalate',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'delayed_escalate' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('delayed_escalate');
    expect(result.policyOverride).toBe(false);
  });

  it('clamps delayed_escalate to early_escalate when max is early_escalate', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'early_escalate',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'delayed_escalate' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('early_escalate');
    expect(result.policyOverride).toBe(true);
  });

  it('handles unknown preference by defaulting to normal_escalate index', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'early_escalate',
    };
    // Unknown preference gets index 1 (normal_escalate), which is > 0 (early_escalate)
    const result = translateTuning(
      makeTuningState({ preference: 'some_unknown_pref' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('early_escalate');
    expect(result.policyOverride).toBe(true);
  });

  it('returns a valid ISO timestamp in decidedAt', () => {
    const constraints: StagedPolicyConstraints = { forcedEscalation: false };
    const result = translateTuning(makeTuningState(), constraints);

    const parsed = new Date(result.decidedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('includes confidence in the reason string', () => {
    const constraints: StagedPolicyConstraints = { forcedEscalation: false };
    const result = translateTuning(
      makeTuningState({ confidence: 0.1234 }),
      constraints,
    );

    expect(result.reason).toContain('0.12');
  });

  it('preserves familyKey from tuning state', () => {
    const constraints: StagedPolicyConstraints = { forcedEscalation: false };
    const result = translateTuning(
      makeTuningState({ familyKey: 'custom:family:key' }),
      constraints,
    );

    expect(result.familyKey).toBe('custom:family:key');
  });

  it('clamps local_preferred_until_fail to delayed_escalate', () => {
    const constraints: StagedPolicyConstraints = {
      forcedEscalation: false,
      maxPermittedPreference: 'delayed_escalate',
    };
    const result = translateTuning(
      makeTuningState({ preference: 'local_preferred_until_fail' }),
      constraints,
    );

    expect(result.escalationPreference).toBe('delayed_escalate');
    expect(result.policyOverride).toBe(true);
    expect(result.reason).toContain("clamped to 'delayed_escalate'");
  });
});
