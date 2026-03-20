import { describe, it, expect } from 'vitest';
import { generateRecommendation, type GenerateRecommendationParams } from './AdaptationRecommendationService.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { PlateauSignal, PlateauIndicators } from '../plateau/PlateauSignal.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';

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

function makeRanked(candidateId: string, score: number, rank: number): RankedCandidate {
  return {
    candidate: makeCandidate({ candidateId }),
    compositeScore: score,
    rank,
    scoreBreakdown: {
      performanceComponent: score * 0.6,
      recencyComponent: score * 0.15,
      successRateComponent: score * 0.25,
    },
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

function makeIndicators(overrides: Partial<PlateauIndicators> = {}): PlateauIndicators {
  return {
    flatQuality: false,
    risingCost: false,
    risingCorrectionBurden: false,
    repeatedFallbacks: false,
    persistentUnderperformance: false,
    ...overrides,
  };
}

function makeSignal(severity: PlateauSignal['severity'], indicators: Partial<PlateauIndicators> = {}): PlateauSignal {
  return {
    familyKey: 'fam:test',
    detected: severity !== 'none',
    severity,
    indicators: makeIndicators(indicators),
    detectedAt: new Date().toISOString(),
  };
}

function makeParams(overrides: Partial<GenerateRecommendationParams> = {}): GenerateRecommendationParams {
  return {
    id: 'rec-1',
    familyKey: 'fam:test',
    plateauSignal: makeSignal('moderate', { flatQuality: true }),
    rankingSnapshot: [makeRanked('a:a:a', 0.9, 1)],
    familyState: makeFamilyState(),
    mode: 'recommend_only',
    ...overrides,
  };
}

describe('generateRecommendation', () => {
  describe('mode filtering', () => {
    it('returns undefined for observe_only mode', () => {
      const result = generateRecommendation(makeParams({ mode: 'observe_only' }));
      expect(result).toBeUndefined();
    });

    it('returns undefined for fully_applied mode', () => {
      const result = generateRecommendation(makeParams({ mode: 'fully_applied' }));
      expect(result).toBeUndefined();
    });

    it('returns recommendation for recommend_only mode', () => {
      const result = generateRecommendation(makeParams({ mode: 'recommend_only' }));
      expect(result).toBeDefined();
      expect(result!.status).toBe('pending');
    });
  });

  describe('auto_apply_low_risk mode', () => {
    it('returns undefined when plateau is not detected', () => {
      const result = generateRecommendation(makeParams({
        mode: 'auto_apply_low_risk',
        plateauSignal: makeSignal('none'),
      }));
      expect(result).toBeUndefined();
    });

    it('returns undefined when plateau severity is mild', () => {
      const result = generateRecommendation(makeParams({
        mode: 'auto_apply_low_risk',
        plateauSignal: makeSignal('mild', { flatQuality: true, risingCost: true }),
      }));
      expect(result).toBeUndefined();
    });

    it('returns recommendation when plateau severity is moderate', () => {
      const result = generateRecommendation(makeParams({
        mode: 'auto_apply_low_risk',
        plateauSignal: makeSignal('moderate', { flatQuality: true }),
      }));
      expect(result).toBeDefined();
    });

    it('returns recommendation when plateau severity is severe', () => {
      const result = generateRecommendation(makeParams({
        mode: 'auto_apply_low_risk',
        plateauSignal: makeSignal('severe', { flatQuality: true }),
      }));
      expect(result).toBeDefined();
    });
  });

  describe('recommendation structure', () => {
    it('includes correct id and familyKey', () => {
      const result = generateRecommendation(makeParams({ id: 'my-id', familyKey: 'my:family' }))!;
      expect(result.id).toBe('my-id');
      expect(result.familyKey).toBe('my:family');
    });

    it('includes the ranking snapshot as recommendedRanking', () => {
      const ranking = [makeRanked('x:x:x', 0.9, 1), makeRanked('y:y:y', 0.7, 2)];
      const result = generateRecommendation(makeParams({ rankingSnapshot: ranking }))!;
      expect(result.recommendedRanking).toBe(ranking);
    });

    it('has status pending', () => {
      const result = generateRecommendation(makeParams())!;
      expect(result.status).toBe('pending');
    });

    it('has a createdAt timestamp', () => {
      const result = generateRecommendation(makeParams())!;
      expect(result.createdAt).toBeTruthy();
      expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('evidence building', () => {
    it('includes plateau info when detected', () => {
      const result = generateRecommendation(makeParams({
        plateauSignal: makeSignal('severe', { flatQuality: true, risingCost: true }),
      }))!;
      expect(result.evidence).toContain('Plateau detected');
      expect(result.evidence).toContain('severe');
      expect(result.evidence).toContain('flatQuality');
      expect(result.evidence).toContain('risingCost');
    });

    it('includes family trend and rolling score', () => {
      const result = generateRecommendation(makeParams({
        familyState: makeFamilyState({ recentTrend: 'declining', rollingScore: 0.4567 }),
      }))!;
      expect(result.evidence).toContain('declining');
      expect(result.evidence).toContain('0.4567');
    });

    it('includes top candidate info when ranking is non-empty', () => {
      const result = generateRecommendation(makeParams({
        rankingSnapshot: [makeRanked('top:t:t', 0.9123, 1)],
      }))!;
      expect(result.evidence).toContain('top:t:t');
      expect(result.evidence).toContain('0.9123');
    });

    it('omits top candidate info when ranking is empty', () => {
      const result = generateRecommendation(makeParams({ rankingSnapshot: [] }))!;
      expect(result.evidence).not.toContain('Top candidate');
    });

    it('omits active indicators line when plateau detected but no indicators active', () => {
      const result = generateRecommendation(makeParams({
        plateauSignal: {
          ...makeSignal('moderate'),
          detected: true,
          indicators: makeIndicators(),
        },
      }))!;
      expect(result.evidence).toContain('Plateau detected');
      expect(result.evidence).not.toContain('Active indicators');
    });

    it('omits plateau line when not detected', () => {
      const result = generateRecommendation(makeParams({
        plateauSignal: makeSignal('none'),
        mode: 'recommend_only',
      }))!;
      expect(result.evidence).not.toContain('Plateau detected');
    });
  });
});
