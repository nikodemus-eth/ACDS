import { describe, it, expect } from 'vitest';
import { computeExplorationRate, shouldExplore } from './ExplorationPolicy.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';

function makeFamilyState(overrides: Partial<FamilySelectionState> = {}): FamilySelectionState {
  return {
    familyKey: 'fam:test',
    currentCandidateId: 'model:tactic:provider',
    rollingScore: 0.8,
    explorationRate: undefined as unknown as number,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
    ...overrides,
  };
}

describe('computeExplorationRate', () => {
  describe('base rate calculation', () => {
    it('computes base rate from baseRate * consequence multiplier for stable, no-plateau state', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state);
      // baseRate(0.1) * medium(1.0) = 0.1
      expect(rate).toBe(0.1);
    });
  });

  describe('consequence levels', () => {
    it('low consequence gives 1.5x multiplier on base rate', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { consequenceLevel: 'low' });
      // 0.1 * 1.5 = 0.15
      expect(rate).toBeCloseTo(0.15, 10);
    });

    it('medium consequence gives 1.0x multiplier on base rate', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { consequenceLevel: 'medium' });
      // 0.1 * 1.0 = 0.1
      expect(rate).toBe(0.1);
    });

    it('high consequence gives 0.5x multiplier on base rate', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { consequenceLevel: 'high' });
      // 0.1 * 0.5 = 0.05
      expect(rate).toBe(0.05);
    });
  });

  describe('plateau boost', () => {
    it('doubles rate when plateau is detected', () => {
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'stable' });
      const rate = computeExplorationRate(state);
      // 0.1 * 1.0 * 2.0 = 0.2
      expect(rate).toBe(0.2);
    });

    it('does not boost when plateau is not detected', () => {
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'stable' });
      const rate = computeExplorationRate(state);
      expect(rate).toBe(0.1);
    });
  });

  describe('trend adjustments', () => {
    it('increases rate by 1.3x when declining', () => {
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'declining' });
      const rate = computeExplorationRate(state);
      // 0.1 * 1.0 * 1.3 = 0.13
      expect(rate).toBeCloseTo(0.13, 10);
    });

    it('decreases rate by decayFactor when improving', () => {
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'improving' });
      const rate = computeExplorationRate(state);
      // 0.1 * 1.0 * 0.95 = 0.095
      expect(rate).toBeCloseTo(0.095, 10);
    });

    it('does not modify rate when stable', () => {
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'stable' });
      const rate = computeExplorationRate(state);
      expect(rate).toBe(0.1);
    });
  });

  describe('combined plateau + trend', () => {
    it('applies both plateau boost and declining boost', () => {
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
      const rate = computeExplorationRate(state);
      // 0.1 * 1.0 * 2.0 * 1.3 = 0.26
      expect(rate).toBeCloseTo(0.26, 10);
    });

    it('applies plateau boost and improving decay', () => {
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'improving' });
      const rate = computeExplorationRate(state);
      // 0.1 * 1.0 * 2.0 * 0.95 = 0.19
      expect(rate).toBeCloseTo(0.19, 10);
    });
  });

  describe('clamping', () => {
    it('clamps to minimumRate when computed rate would be below it', () => {
      // Use high consequence + improving to get a small rate
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'improving' });
      const rate = computeExplorationRate(state, { consequenceLevel: 'high', minimumRate: 0.05 });
      // 0.1 * 0.5 * 0.95 = 0.0475, clamped to 0.05
      expect(rate).toBe(0.05);
    });

    it('clamps to maximumRate when computed rate would exceed it', () => {
      // Use low consequence + plateau + declining to get a high rate
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
      const rate = computeExplorationRate(state, { consequenceLevel: 'low', maximumRate: 0.3 });
      // 0.1 * 1.5 * 2.0 * 1.3 = 0.39, clamped to 0.3
      expect(rate).toBe(0.3);
    });

    it('clamps to default maximumRate (0.5)', () => {
      // Use very high baseRate to exceed 0.5
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
      const rate = computeExplorationRate(state, { baseRate: 0.5, consequenceLevel: 'low' });
      // 0.5 * 1.5 * 2.0 * 1.3 = 1.95, clamped to 0.5
      expect(rate).toBe(0.5);
    });

    it('clamps to default minimumRate (0.01)', () => {
      // Use very small baseRate
      const state = makeFamilyState({ plateauDetected: false, recentTrend: 'improving' });
      const rate = computeExplorationRate(state, { baseRate: 0.005, consequenceLevel: 'high' });
      // 0.005 * 0.5 * 0.95 = 0.002375, clamped to 0.01
      expect(rate).toBe(0.01);
    });
  });

  describe('familyState.explorationRate baseline', () => {
    it('uses familyState.explorationRate when no config is provided', () => {
      const state = makeFamilyState({ explorationRate: 0.25, recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state);
      expect(rate).toBe(0.25);
    });

    it('ignores familyState.explorationRate when config overrides are provided', () => {
      const state = makeFamilyState({ explorationRate: 0.25, recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { baseRate: 0.3 });
      expect(rate).toBe(0.3);
    });

    it('uses zero explorationRate from familyState (no exploration)', () => {
      const state = makeFamilyState({ explorationRate: 0.0, recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state);
      // 0.0 clamped to minimumRate 0.01
      expect(rate).toBe(0.01);
    });

    it('falls back to config when familyState.explorationRate is undefined', () => {
      const state = makeFamilyState({ explorationRate: undefined as unknown as number });
      const rate = computeExplorationRate(state);
      // baseRate(0.1) * medium(1.0) = 0.1
      expect(rate).toBe(0.1);
    });
  });

  describe('custom config overrides', () => {
    it('uses custom baseRate', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { baseRate: 0.2 });
      // 0.2 * 1.0 = 0.2
      expect(rate).toBe(0.2);
    });

    it('uses custom decayFactor for improving trend', () => {
      const state = makeFamilyState({ recentTrend: 'improving', plateauDetected: false });
      const rate = computeExplorationRate(state, { decayFactor: 0.5 });
      // 0.1 * 1.0 * 0.5 = 0.05
      expect(rate).toBe(0.05);
    });

    it('accepts partial config and merges with defaults', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, { baseRate: 0.3 });
      // 0.3 * 1.0 = 0.3
      expect(rate).toBe(0.3);
    });

    it('uses empty config object (all defaults)', () => {
      const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
      const rate = computeExplorationRate(state, {});
      expect(rate).toBe(0.1);
    });
  });
});

describe('shouldExplore', () => {
  it('returns a boolean', () => {
    const state = makeFamilyState();
    const result = shouldExplore(state);
    expect(typeof result).toBe('boolean');
  });

  it('statistically explores at roughly the computed rate', () => {
    // With default config: rate = 0.1, so ~10% of the time should return true
    const state = makeFamilyState({ recentTrend: 'stable', plateauDetected: false });
    let trueCount = 0;
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      if (shouldExplore(state)) trueCount++;
    }
    // With rate=0.1, expect ~100/1000 true. Allow generous range.
    expect(trueCount).toBeGreaterThan(30);
    expect(trueCount).toBeLessThan(200);
  });

  it('explores more frequently with plateau + declining (high rate)', () => {
    const highRateState = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
    // rate = 0.1 * 2.0 * 1.3 = 0.26
    let trueCount = 0;
    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      if (shouldExplore(highRateState)) trueCount++;
    }
    // ~26% => ~130/500
    expect(trueCount).toBeGreaterThan(60);
    expect(trueCount).toBeLessThan(220);
  });

  it('passes config through to computeExplorationRate', () => {
    // With maximumRate=1.0 and a very high base rate + boosts, rate should clamp to 1.0 => always true
    const state = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
    let trueCount = 0;
    for (let i = 0; i < 50; i++) {
      if (shouldExplore(state, { baseRate: 1.0, maximumRate: 1.0 })) trueCount++;
    }
    // rate = 1.0 * 1.0 * 2.0 * 1.3 = 2.6, clamped to 1.0 => always true
    expect(trueCount).toBe(50);
  });

  it('with very low rate, rarely returns true', () => {
    const state = makeFamilyState({ plateauDetected: false, recentTrend: 'improving' });
    // rate = 0.1 * 0.5 * 0.95 = 0.0475, but with default min 0.01 and high consequence
    // Let's use minimumRate of 0 and very small base
    let trueCount = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldExplore(state, { baseRate: 0.001, consequenceLevel: 'high', minimumRate: 0 })) trueCount++;
    }
    // rate = 0.001 * 0.5 * 0.95 = 0.000475, min 0 => almost never
    expect(trueCount).toBeLessThan(5);
  });
});
