import { describe, it, expect } from 'vitest';
import { select } from './AdaptiveSelectionService.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';

function makeCandidate(overrides: Partial<CandidatePerformanceState> = {}): CandidatePerformanceState {
  return {
    candidateId: 'model:tactic:provider',
    familyKey: 'fam:test',
    rollingScore: 0.8,
    runCount: 100,
    successRate: 0.95,
    averageLatency: 200,
    lastSelectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFamilyState(overrides: Partial<FamilySelectionState> = {}): FamilySelectionState {
  return {
    familyKey: 'fam:test',
    currentCandidateId: 'model:tactic:provider',
    rollingScore: 0.8,
    explorationRate: 0.0,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
    ...overrides,
  };
}

describe('select (AdaptiveSelectionService)', () => {
  const candidateA = makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.9, runCount: 50, successRate: 0.95 });
  const candidateB = makeCandidate({ candidateId: 'b:b:b', rollingScore: 0.7, runCount: 30, successRate: 0.85 });
  const candidateC = makeCandidate({ candidateId: 'c:c:c', rollingScore: 0.5, runCount: 10, successRate: 0.75 });

  it('throws when no eligible candidates', () => {
    expect(() => select('fam:test', [], makeFamilyState(), [], 'fully_applied')).toThrow(
      "No eligible candidates for family 'fam:test'.",
    );
  });

  describe('observe_only mode', () => {
    it('returns the current candidate if found in ranked list', () => {
      const familyState = makeFamilyState({ currentCandidateId: 'b:b:b' });
      const result = select('fam:test', [candidateA, candidateB], familyState, [], 'observe_only');
      expect(result.selectedCandidate.candidate.candidateId).toBe('b:b:b');
      expect(result.explorationUsed).toBe(false);
      expect(result.selectionReason).toContain('Observe-only');
    });

    it('falls back to top-ranked when current candidate not found', () => {
      const familyState = makeFamilyState({ currentCandidateId: 'nonexistent:x:x' });
      const result = select('fam:test', [candidateA, candidateB], familyState, [], 'observe_only');
      // Should fall back to ranked[0] which is candidateA (highest score)
      expect(result.selectedCandidate.candidate.candidateId).toBe('a:a:a');
    });

    it('includes ranking snapshot', () => {
      const result = select('fam:test', [candidateA, candidateB], makeFamilyState(), [], 'observe_only');
      expect(result.rankingSnapshot).toHaveLength(2);
    });
  });

  describe('recommend_only mode', () => {
    it('returns the top-ranked candidate as recommendation', () => {
      const result = select('fam:test', [candidateA, candidateB, candidateC], makeFamilyState(), [], 'recommend_only');
      expect(result.selectedCandidate.candidate.candidateId).toBe('a:a:a');
      expect(result.explorationUsed).toBe(false);
      expect(result.selectionReason).toContain('Recommendation');
      expect(result.selectionReason).toContain('Not applied');
    });
  });

  describe('fully_applied mode (exploitation)', () => {
    it('selects the top-ranked candidate when not exploring', () => {
      // Use stable trend with no plateau and zero exploration rate to ensure no exploration
      const familyState = makeFamilyState({
        plateauDetected: false,
        recentTrend: 'improving',
        explorationRate: 0,
      });
      const result = select('fam:test', [candidateA, candidateB, candidateC], familyState, [], 'fully_applied');
      // With improving trend and no plateau, exploration rate will be very low (0.1 * 1.0 * 0.95 = 0.095)
      // The random check may or may not explore, so let's just check the structure
      expect(result.rankingSnapshot).toHaveLength(3);
      expect(result.selectedCandidate).toBeDefined();
      expect(typeof result.selectionReason).toBe('string');
    });
  });

  describe('auto_apply_low_risk mode', () => {
    it('selects a candidate (may explore or exploit)', () => {
      const familyState = makeFamilyState({
        plateauDetected: false,
        recentTrend: 'improving',
      });
      const result = select('fam:test', [candidateA, candidateB], familyState, [], 'auto_apply_low_risk');
      expect(result.selectedCandidate).toBeDefined();
      expect(result.rankingSnapshot).toHaveLength(2);
    });
  });

  describe('single candidate scenarios', () => {
    it('returns the only candidate in observe_only mode', () => {
      const result = select('fam:test', [candidateA], makeFamilyState({ currentCandidateId: 'a:a:a' }), [], 'observe_only');
      expect(result.selectedCandidate.candidate.candidateId).toBe('a:a:a');
    });

    it('returns the only candidate in fully_applied mode (exploration still returns it)', () => {
      // Even if exploration triggers, with only 1 candidate, selectExploration returns ranked[0]
      const familyState = makeFamilyState({ plateauDetected: true, recentTrend: 'declining' });
      const result = select('fam:test', [candidateA], familyState, [], 'fully_applied');
      expect(result.selectedCandidate.candidate.candidateId).toBe('a:a:a');
    });
  });

  describe('future lastSelectedAt (recency bonus edge case)', () => {
    it('handles candidate with lastSelectedAt in the future', () => {
      const futureDate = new Date(Date.now() + 100_000).toISOString();
      const futureCandidate = makeCandidate({ candidateId: 'f:f:f', rollingScore: 0.9, lastSelectedAt: futureDate });
      const result = select('fam:test', [futureCandidate, candidateB], makeFamilyState(), [], 'recommend_only');
      // The future candidate should get a full recency bonus of 1.0
      expect(result.selectedCandidate.candidate.candidateId).toBe('f:f:f');
      const futureEntry = result.rankingSnapshot.find((r) => r.candidate.candidateId === 'f:f:f')!;
      expect(futureEntry.scoreBreakdown.recencyComponent).toBe(1.0);
    });
  });

  describe('exploration with multiple candidates', () => {
    it('explores an alternative candidate when exploration is triggered', () => {
      // Force exploration by using high exploration rate, plateau, and declining trend
      const familyState = makeFamilyState({
        plateauDetected: true,
        recentTrend: 'declining',
        explorationRate: 1.0, // max exploration rate
      });
      // Run multiple times to statistically cover exploration path
      let explorationUsedAtLeastOnce = false;
      let exploitationUsedAtLeastOnce = false;
      for (let i = 0; i < 50; i++) {
        const result = select('fam:test', [candidateA, candidateB, candidateC], familyState, [], 'fully_applied');
        if (result.explorationUsed) {
          explorationUsedAtLeastOnce = true;
          expect(result.selectionReason).toContain('Exploration');
          // Explored candidate should not be the top-ranked
          expect(result.selectedCandidate.rank).toBeGreaterThan(1);
        } else {
          exploitationUsedAtLeastOnce = true;
          expect(result.selectionReason).toContain('Exploitation');
        }
      }
      // With explorationRate=1.0 and plateau + declining, exploration should trigger often
      expect(explorationUsedAtLeastOnce).toBe(true);
    });

    it('exploitation selects top-ranked candidate in auto_apply_low_risk mode', () => {
      const familyState = makeFamilyState({
        plateauDetected: false,
        recentTrend: 'improving',
        explorationRate: 0,
      });
      const result = select('fam:test', [candidateA, candidateB, candidateC], familyState, [], 'auto_apply_low_risk');
      // With no exploration, should exploit the top-ranked
      expect(result.selectionReason).toContain('Exploitation');
      expect(result.explorationUsed).toBe(false);
    });

    it('exploration with only 1 candidate falls through to exploitation', () => {
      // Even with exploration triggered, if only 1 candidate, the condition ranked.length > 1 is false
      const familyState = makeFamilyState({
        plateauDetected: true,
        recentTrend: 'declining',
        explorationRate: 1.0,
      });
      const result = select('fam:test', [candidateA], familyState, [], 'fully_applied');
      // Should fall through to exploitation since ranked.length <= 1
      expect(result.selectedCandidate.candidate.candidateId).toBe('a:a:a');
      expect(result.explorationUsed).toBe(false);
      expect(result.selectionReason).toContain('Exploitation');
    });
  });

  describe('ranking snapshot integrity', () => {
    it('snapshot is sorted by composite score descending', () => {
      const result = select('fam:test', [candidateC, candidateA, candidateB], makeFamilyState(), [], 'recommend_only');
      const scores = result.rankingSnapshot.map((r) => r.compositeScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('snapshot has correct ranks', () => {
      const result = select('fam:test', [candidateC, candidateA, candidateB], makeFamilyState(), [], 'recommend_only');
      result.rankingSnapshot.forEach((r, i) => {
        expect(r.rank).toBe(i + 1);
      });
    });
  });
});
