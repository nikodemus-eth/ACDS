/**
 * Policy tiers govern what level of trust and default access a method receives.
 *
 * Tier A: Core sovereign execution — allowed by default, trusted for routing and automation.
 * Tier B: Assistive methods — allowed by default, used for refinement not control.
 * Tier C: Creative methods — allowed by policy, non-core outputs.
 * Tier D: External-augmented — blocked in sovereign mode, requires explicit policy override.
 */
export enum PolicyTier {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export const POLICY_TIER_LABELS: Record<PolicyTier, string> = {
  [PolicyTier.A]: 'Core Execution',
  [PolicyTier.B]: 'Assistive',
  [PolicyTier.C]: 'Creative',
  [PolicyTier.D]: 'External Augmentation',
};

/** Tiers that are allowed in sovereign (local-only) mode. */
export const SOVEREIGN_ALLOWED_TIERS = new Set([PolicyTier.A, PolicyTier.B, PolicyTier.C]);
