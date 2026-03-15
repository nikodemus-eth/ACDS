/**
 * ARGUS-9 Tier 3 — Adaptive Selection Integrity
 *
 * Tests that AdaptiveSelectionService, CandidateRanker, and
 * AdaptationRecommendationService have integrity gaps.
 */

import { describe, it, expect } from 'vitest';
import {
  select,
  rankCandidates,
  generateRecommendation,
} from '@acds/adaptive-optimizer';
import type { PlateauSignal } from '@acds/adaptive-optimizer';
import { makeFamilyState, makeCandidateState, makeRankedCandidate } from './_fixtures.js';

function makePlateauSignal(overrides: Partial<PlateauSignal> = {}): PlateauSignal {
  return {
    familyKey: 'test-app:test-process:test-step',
    detected: true,
    severity: 'moderate',
    indicators: {
      flatQuality: true,
      risingCost: false,
      risingCorrectionBurden: false,
      repeatedFallbacks: false,
      persistentUnderperformance: false,
    },
    detectedAt: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

describe('ARGUS F8-F10: Adaptive Selection Corruption', () => {

  describe('AdaptiveSelectionService.select', () => {

    it('permits observe_only to retain worst-ranked candidate without quality gate', () => {
      // VULN: observe_only returns current candidate regardless of how bad it is
      const worst = makeCandidateState({ candidateId: 'bad:one:1', rollingScore: 0.01, successRate: 0.01 });
      const best = makeCandidateState({ candidateId: 'good:one:1', rollingScore: 0.99, successRate: 0.99 });
      const state = makeFamilyState({ currentCandidateId: 'bad:one:1' });

      const result = select('fam', [worst, best], state, [worst, best], 'observe_only');
      expect(result.selectedCandidate.candidate.candidateId).toBe('bad:one:1');
      expect(result.explorationUsed).toBe(false);
    });

    it('returns mutable ranking snapshot from select', () => {
      // VULN: rankingSnapshot is returned by reference — caller can mutate it
      const candidates = [
        makeCandidateState({ candidateId: 'a:b:c', rollingScore: 0.8 }),
        makeCandidateState({ candidateId: 'd:e:f', rollingScore: 0.5 }),
      ];
      const state = makeFamilyState();

      const result = select('fam', candidates, state, candidates, 'recommend_only');
      const originalRank = result.rankingSnapshot[0].rank;
      result.rankingSnapshot[0].rank = 999;
      expect(result.rankingSnapshot[0].rank).toBe(999);
      expect(result.rankingSnapshot[0].rank).not.toBe(originalRank);
    });

    it('selects single candidate regardless of quality — no minimum quality gate', () => {
      // VULN: single candidate with terrible metrics still selected
      const terrible = makeCandidateState({
        candidateId: 'a:b:c',
        rollingScore: 0.0,
        successRate: 0.0,
        runCount: 0,
      });
      const state = makeFamilyState({ currentCandidateId: 'a:b:c' });

      const result = select('fam', [terrible], state, [terrible], 'fully_applied');
      expect(result.selectedCandidate.candidate.rollingScore).toBe(0.0);
    });
  });

  describe('rankCandidates — reference mutation', () => {

    it('returns mutable references — mutating output mutates input', () => {
      // VULN: ranked candidates reference the original candidate objects
      const candidate = makeCandidateState({ candidateId: 'a:b:c' });
      const state = makeFamilyState();
      const ranked = rankCandidates([candidate], state);

      ranked[0].candidate.rollingScore = 999;
      expect(candidate.rollingScore).toBe(999);
    });
  });

  describe('generateRecommendation — mode suppression', () => {

    it('returns undefined for observe_only regardless of severity', () => {
      // observe_only never generates recommendations
      const result = generateRecommendation({
        id: 'rec-1',
        familyKey: 'fam',
        plateauSignal: makePlateauSignal({ severity: 'severe' }),
        rankingSnapshot: [makeRankedCandidate()],
        familyState: makeFamilyState(),
        mode: 'observe_only',
      });
      expect(result).toBeUndefined();
    });

    it('returns undefined for fully_applied regardless of severity', () => {
      // fully_applied auto-applies without needing a recommendation
      const result = generateRecommendation({
        id: 'rec-2',
        familyKey: 'fam',
        plateauSignal: makePlateauSignal({ severity: 'severe' }),
        rankingSnapshot: [makeRankedCandidate()],
        familyState: makeFamilyState(),
        mode: 'fully_applied',
      });
      expect(result).toBeUndefined();
    });

    it('suppresses mild plateau in auto_apply_low_risk — attacker controls severity', () => {
      // VULN: if attacker can influence plateau severity to remain 'mild',
      // recommendations are suppressed in auto_apply_low_risk mode
      const result = generateRecommendation({
        id: 'rec-3',
        familyKey: 'fam',
        plateauSignal: makePlateauSignal({ severity: 'mild' }),
        rankingSnapshot: [makeRankedCandidate()],
        familyState: makeFamilyState(),
        mode: 'auto_apply_low_risk',
      });
      expect(result).toBeUndefined();
    });

    it('uses current rankingSnapshot as recommendedRanking — recommends status quo', () => {
      // VULN: generateRecommendation sets recommendedRanking = rankingSnapshot
      // This means it recommends the current state, not a new ordering
      const snapshot = [
        makeRankedCandidate({ rank: 1, candidate: makeCandidateState({ candidateId: 'a:b:c' }) }),
        makeRankedCandidate({ rank: 2, candidate: makeCandidateState({ candidateId: 'd:e:f' }) }),
      ];
      const result = generateRecommendation({
        id: 'rec-4',
        familyKey: 'fam',
        plateauSignal: makePlateauSignal({ severity: 'moderate' }),
        rankingSnapshot: snapshot,
        familyState: makeFamilyState(),
        mode: 'recommend_only',
      });
      expect(result).toBeDefined();
      expect(result!.recommendedRanking).toBe(snapshot); // Same reference
    });
  });
});
