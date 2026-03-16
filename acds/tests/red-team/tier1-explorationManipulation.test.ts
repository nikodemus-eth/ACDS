/**
 * ARGUS-9 Tier 1 — Exploration Policy Manipulation
 *
 * Tests that ExplorationPolicy configuration can be abused to
 * force permanent exploration or disable it entirely.
 */

import { describe, it, expect } from 'vitest';
import { computeExplorationRate, shouldExplore, select } from '@acds/adaptive-optimizer';
import { makeFamilyState, makeCandidateState } from './_fixtures.js';

describe('ARGUS F4-F6: Exploration Policy Manipulation', () => {

  describe('computeExplorationRate — multiplier abuse', () => {

    it('produces rate exceeding maximumRate when multipliers compound unclamped', () => {
      // VULN: plateauDetected (×2) + declining (×1.3) + low consequence (×1.5) = baseRate × 3.9
      // But the function clamps at maximumRate, so this tests that clamping works
      const state = makeFamilyState({
        plateauDetected: true,
        recentTrend: 'declining',
      });
      const rate = computeExplorationRate(state, {
        baseRate: 0.3,
        consequenceLevel: 'low',
        maximumRate: 0.5,
      });
      // 0.3 * 1.5 * 2.0 * 1.3 = 1.17 → clamped to 0.5
      expect(rate).toBe(0.5);
    });

    it('permits minimumRate: 1.0 forcing permanent exploration', () => {
      // VULN: config accepts minimumRate >= maximumRate → permanent exploration
      const state = makeFamilyState({ recentTrend: 'improving' });
      const rate = computeExplorationRate(state, {
        baseRate: 0.01,
        minimumRate: 1.0,
        maximumRate: 1.0,
      });
      expect(rate).toBe(1.0);
    });

    it('permits maximumRate: 0.0 disabling exploration even during plateau', () => {
      // VULN: config can completely disable exploration override mechanism
      const state = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
      const rate = computeExplorationRate(state, {
        baseRate: 0.5,
        maximumRate: 0.0,
        minimumRate: 0.0,
      });
      expect(rate).toBe(0);
    });

    it('permits negative baseRate producing negative exploration rate', () => {
      // VULN: no validation on baseRate being non-negative
      const state = makeFamilyState();
      const rate = computeExplorationRate(state, {
        baseRate: -0.5,
        minimumRate: -1.0,
        maximumRate: 1.0,
      });
      expect(rate).toBeLessThan(0);
    });
  });

  describe('shouldExplore — non-determinism', () => {

    it('produces inconsistent results across calls (Math.random dependency)', () => {
      // VULN: shouldExplore uses Math.random() — not deterministic, not seedable
      const state = makeFamilyState();
      const config = { baseRate: 0.5, consequenceLevel: 'low' as const };
      const results = Array.from({ length: 100 }, () => shouldExplore(state, config));
      const trueCount = results.filter(Boolean).length;
      // With rate ~0.75, we expect some variation
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(100);
    });
  });

  describe('select — single candidate exploration', () => {

    it('selects only candidate even during exploration', () => {
      // VULN: single-candidate exploration always returns the same candidate
      const candidates = [
        makeCandidateState({ candidateId: 'only:one:here', rollingScore: 0.1, successRate: 0.1 }),
      ];
      const state = makeFamilyState({ currentCandidateId: 'only:one:here' });
      const result = select('fam', candidates, state, candidates, 'fully_applied');
      expect(result.selectedCandidate.candidate.candidateId).toBe('only:one:here');
    });

    it('permits observe_only to retain worst-ranked candidate', () => {
      // VULN: observe_only returns current candidate even if it's the worst
      const candidates = [
        makeCandidateState({ candidateId: 'bad:one:here', rollingScore: 0.1, successRate: 0.1 }),
        makeCandidateState({ candidateId: 'good:one:here', rollingScore: 0.9, successRate: 0.9 }),
      ];
      const state = makeFamilyState({ currentCandidateId: 'bad:one:here' });
      const result = select('fam', candidates, state, candidates, 'observe_only');
      // observe_only retains current even if it's ranked worst
      expect(result.selectedCandidate.candidate.candidateId).toBe('bad:one:here');
    });

    it('throws on empty candidates', () => {
      // Not a vulnerability — verifies expected error
      const state = makeFamilyState();
      expect(() => select('fam', [], state, [], 'fully_applied')).toThrow('No eligible candidates');
    });
  });
});
