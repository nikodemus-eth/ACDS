/**
 * ExplorationPolicy - Determines whether the optimizer should explore
 * an alternative candidate instead of exploiting the current best.
 *
 * Exploration is biased higher for low-consequence families (where the
 * cost of a sub-optimal choice is low) and lower for high-consequence
 * families. The rate decays over time as more data is collected.
 */

import type { FamilySelectionState } from '../state/FamilySelectionState.js';

export interface ExplorationConfig {
  /** Base exploration rate (default 0.1 = 10%). */
  baseRate: number;

  /**
   * Decay factor applied based on stability.
   * Higher values cause exploration to decay faster as performance stabilizes.
   * Default 0.95.
   */
  decayFactor: number;

  /**
   * Consequence level of the family: 'low' | 'medium' | 'high'.
   * Low-consequence families get a higher exploration multiplier.
   */
  consequenceLevel: 'low' | 'medium' | 'high';

  /** Minimum exploration rate floor (default 0.01). */
  minimumRate: number;

  /** Maximum exploration rate ceiling (default 0.5). */
  maximumRate: number;
}

const DEFAULT_CONFIG: ExplorationConfig = {
  baseRate: 0.1,
  decayFactor: 0.95,
  consequenceLevel: 'medium',
  minimumRate: 0.01,
  maximumRate: 0.5,
};

const CONSEQUENCE_MULTIPLIERS: Record<ExplorationConfig['consequenceLevel'], number> = {
  low: 1.5,
  medium: 1.0,
  high: 0.5,
};

/**
 * Computes the effective exploration rate for a family, accounting for
 * consequence level, plateau state, and trend.
 */
export function computeExplorationRate(
  familyState: FamilySelectionState,
  config: Partial<ExplorationConfig> = {},
): number {
  const c: ExplorationConfig = { ...DEFAULT_CONFIG, ...config };

  let rate = c.baseRate * CONSEQUENCE_MULTIPLIERS[c.consequenceLevel];

  // If a plateau is detected, boost exploration to escape it
  if (familyState.plateauDetected) {
    rate *= 2.0;
  }

  // If performance is declining, increase exploration slightly
  if (familyState.recentTrend === 'declining') {
    rate *= 1.3;
  }

  // If performance is improving, reduce exploration (exploit the gain)
  if (familyState.recentTrend === 'improving') {
    rate *= c.decayFactor;
  }

  // Clamp to bounds
  return Math.max(c.minimumRate, Math.min(c.maximumRate, rate));
}

/**
 * Decides whether to explore a non-top candidate for this selection.
 *
 * @param familyState - Current family selection state.
 * @param config - Exploration configuration overrides.
 * @returns true if the optimizer should explore an alternative candidate.
 */
export function shouldExplore(
  familyState: FamilySelectionState,
  config: Partial<ExplorationConfig> = {},
): boolean {
  const rate = computeExplorationRate(familyState, config);
  return Math.random() < rate;
}
