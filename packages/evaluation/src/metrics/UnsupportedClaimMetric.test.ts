import { describe, it, expect } from 'vitest';
import { evaluateUnsupportedClaims } from './UnsupportedClaimMetric.js';

describe('evaluateUnsupportedClaims', () => {
  it('returns 1.0 for zero unsupported claims', () => {
    const result = evaluateUnsupportedClaims({ unsupportedClaimCount: 0 });
    expect(result.score).toBe(1.0);
    expect(result.label).toBe('unsupported-claims');
  });

  it('decrements by 0.25 per claim', () => {
    expect(evaluateUnsupportedClaims({ unsupportedClaimCount: 1 }).score).toBeCloseTo(0.75);
    expect(evaluateUnsupportedClaims({ unsupportedClaimCount: 2 }).score).toBeCloseTo(0.5);
    expect(evaluateUnsupportedClaims({ unsupportedClaimCount: 3 }).score).toBeCloseTo(0.25);
  });

  it('floors at 0.0 for 4 or more claims', () => {
    expect(evaluateUnsupportedClaims({ unsupportedClaimCount: 4 }).score).toBe(0.0);
    expect(evaluateUnsupportedClaims({ unsupportedClaimCount: 10 }).score).toBe(0.0);
  });

  it('includes claim details', () => {
    const result = evaluateUnsupportedClaims({ unsupportedClaimCount: 2 });
    expect(result.details.unsupportedClaimCount).toBe(2);
    expect(result.details.decrementPerFlag).toBe(0.25);
  });
});
