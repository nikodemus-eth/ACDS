import { describe, it, expect } from 'vitest';
import { computeInstanceOverrides } from './InstancePolicyOverlay.js';
import type { NormalizedInstanceContext } from './InstanceContextNormalizer.js';

function makeContext(overrides: Partial<NormalizedInstanceContext> = {}): NormalizedInstanceContext {
  return {
    retryCount: 0,
    previousFailures: [],
    deadlinePressure: false,
    humanReviewStatus: 'none',
    additionalMetadata: {},
    ...overrides,
  };
}

describe('computeInstanceOverrides', () => {
  it('returns no escalation and no cost boost for default context', () => {
    const result = computeInstanceOverrides(makeContext());
    expect(result.forceEscalation).toBe(false);
    expect(result.forceLocalOnly).toBe(false);
    expect(result.boostCostSensitivity).toBe(false);
  });

  it('forces escalation when retryCount > 2', () => {
    const result = computeInstanceOverrides(makeContext({ retryCount: 3 }));
    expect(result.forceEscalation).toBe(true);
  });

  it('does not force escalation when retryCount is exactly 2', () => {
    const result = computeInstanceOverrides(makeContext({ retryCount: 2 }));
    expect(result.forceEscalation).toBe(false);
  });

  it('forces escalation when previousFailures length > 1', () => {
    const result = computeInstanceOverrides(makeContext({ previousFailures: ['a', 'b'] }));
    expect(result.forceEscalation).toBe(true);
  });

  it('does not force escalation when previousFailures length is exactly 1', () => {
    const result = computeInstanceOverrides(makeContext({ previousFailures: ['a'] }));
    expect(result.forceEscalation).toBe(false);
  });

  it('forces escalation when both retryCount > 2 and previousFailures > 1', () => {
    const result = computeInstanceOverrides(makeContext({ retryCount: 5, previousFailures: ['a', 'b', 'c'] }));
    expect(result.forceEscalation).toBe(true);
  });

  it('always returns forceLocalOnly as false', () => {
    const result = computeInstanceOverrides(makeContext({ retryCount: 10, deadlinePressure: true }));
    expect(result.forceLocalOnly).toBe(false);
  });

  it('boosts cost sensitivity when deadlinePressure is true', () => {
    const result = computeInstanceOverrides(makeContext({ deadlinePressure: true }));
    expect(result.boostCostSensitivity).toBe(true);
  });

  it('does not boost cost sensitivity when deadlinePressure is false', () => {
    const result = computeInstanceOverrides(makeContext({ deadlinePressure: false }));
    expect(result.boostCostSensitivity).toBe(false);
  });
});
