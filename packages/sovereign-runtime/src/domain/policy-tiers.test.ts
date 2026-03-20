import { describe, it, expect } from 'vitest';
import { PolicyTier, POLICY_TIER_LABELS, SOVEREIGN_ALLOWED_TIERS } from './policy-tiers.js';

describe('Policy Tiers', () => {
  it('PolicyTier has four tiers', () => {
    expect(PolicyTier.A).toBe('A');
    expect(PolicyTier.B).toBe('B');
    expect(PolicyTier.C).toBe('C');
    expect(PolicyTier.D).toBe('D');
  });

  it('POLICY_TIER_LABELS has label for each tier', () => {
    expect(POLICY_TIER_LABELS[PolicyTier.A]).toBe('Core Execution');
    expect(POLICY_TIER_LABELS[PolicyTier.B]).toBe('Assistive');
    expect(POLICY_TIER_LABELS[PolicyTier.C]).toBe('Creative');
    expect(POLICY_TIER_LABELS[PolicyTier.D]).toBe('External Augmentation');
  });

  it('SOVEREIGN_ALLOWED_TIERS includes A, B, C but not D', () => {
    expect(SOVEREIGN_ALLOWED_TIERS.has(PolicyTier.A)).toBe(true);
    expect(SOVEREIGN_ALLOWED_TIERS.has(PolicyTier.B)).toBe(true);
    expect(SOVEREIGN_ALLOWED_TIERS.has(PolicyTier.C)).toBe(true);
    expect(SOVEREIGN_ALLOWED_TIERS.has(PolicyTier.D)).toBe(false);
  });
});
