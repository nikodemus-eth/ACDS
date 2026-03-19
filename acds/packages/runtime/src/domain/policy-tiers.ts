/**
 * Policy tiers govern what categories of methods are permitted
 * under a given execution policy.
 *
 * Ordering: A (most permissive by default) through D (most restricted).
 */
export enum PolicyTier {
  /** Core sovereign execution -- allowed by default. */
  A = "A",
  /** Assistive -- allowed by default unless stricter policy applies. */
  B = "B",
  /** Creative -- allowed by policy, non-core. */
  C = "C",
  /** External-augmented -- blocked in sovereign mode. */
  D = "D",
}

/** Numeric weight so tiers are orderable (lower = less restricted). */
const TIER_ORDER: Record<PolicyTier, number> = {
  [PolicyTier.A]: 0,
  [PolicyTier.B]: 1,
  [PolicyTier.C]: 2,
  [PolicyTier.D]: 3,
};

/**
 * Returns true when `a` is stricter than or equal to `b`.
 * e.g. tierAtLeast(PolicyTier.C, PolicyTier.B) === true
 */
export function tierAtLeast(a: PolicyTier, b: PolicyTier): boolean {
  return TIER_ORDER[a] >= TIER_ORDER[b];
}

/** Compare two tiers. Negative means `a` is less restricted. */
export function compareTiers(a: PolicyTier, b: PolicyTier): number {
  return TIER_ORDER[a] - TIER_ORDER[b];
}

/** Whether a tier is allowed by default in sovereign mode. */
export function isSovereignDefault(tier: PolicyTier): boolean {
  return tier === PolicyTier.A || tier === PolicyTier.B;
}
