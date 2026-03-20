import { describe, it, expect, beforeEach } from 'vitest';
import {
  LowRiskAutoApplyService,
  type FamilyRiskProvider,
  type FamilyPostureProvider,
  type RecentFailureCounter,
  type AutoApplyDecisionWriter,
  type AutoApplyStateApplier,
} from './LowRiskAutoApplyService.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { AdaptationRecommendation } from './AdaptationRecommendationService.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { FamilyRiskLevel } from './AdaptiveModePolicy.js';
import type { AutoApplyDecisionRecord } from './AutoApplyDecisionRecord.js';

// ── Real implementations ──────────────────────────────────────────────

class RealRiskProvider implements FamilyRiskProvider {
  riskMap = new Map<string, FamilyRiskLevel>();
  async getRiskLevel(familyKey: string): Promise<FamilyRiskLevel> {
    return this.riskMap.get(familyKey) ?? 'low';
  }
}

class RealPostureProvider implements FamilyPostureProvider {
  postureMap = new Map<string, string>();
  async getPosture(familyKey: string): Promise<string> {
    return this.postureMap.get(familyKey) ?? 'advisory';
  }
}

class RealFailureCounter implements RecentFailureCounter {
  failureMap = new Map<string, number>();
  async countRecentFailures(familyKey: string): Promise<number> {
    return this.failureMap.get(familyKey) ?? 0;
  }
}

class RealDecisionWriter implements AutoApplyDecisionWriter {
  records: AutoApplyDecisionRecord[] = [];
  async save(record: AutoApplyDecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

class RealStateApplier implements AutoApplyStateApplier {
  applied: AutoApplyDecisionRecord[] = [];
  async apply(record: AutoApplyDecisionRecord): Promise<void> {
    this.applied.push(record);
  }
}

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

function makeRecommendation(overrides: Partial<AdaptationRecommendation> = {}): AdaptationRecommendation {
  return {
    id: 'rec-1',
    familyKey: 'fam:test',
    recommendedRanking: [makeRanked('b:b:b', 0.95, 1)],
    evidence: 'Test evidence',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LowRiskAutoApplyService', () => {
  let riskProvider: RealRiskProvider;
  let postureProvider: RealPostureProvider;
  let failureCounter: RealFailureCounter;
  let decisionWriter: RealDecisionWriter;
  let stateApplier: RealStateApplier;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new RealRiskProvider();
    postureProvider = new RealPostureProvider();
    failureCounter = new RealFailureCounter();
    decisionWriter = new RealDecisionWriter();
    stateApplier = new RealStateApplier();

    riskProvider.riskMap.set('fam:test', 'low');
    postureProvider.postureMap.set('fam:test', 'advisory');
    failureCounter.failureMap.set('fam:test', 0);

    service = new LowRiskAutoApplyService(
      riskProvider, postureProvider, failureCounter, decisionWriter, {}, stateApplier,
    );
  });

  describe('constructor validation', () => {
    it('throws when rollingScoreThreshold is out of range', () => {
      expect(() => new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
        { rollingScoreThreshold: -0.1 },
      )).toThrow('rollingScoreThreshold must be between 0 and 1');

      expect(() => new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
        { rollingScoreThreshold: 1.1 },
      )).toThrow('rollingScoreThreshold must be between 0 and 1');
    });

    it('throws when maxRecentFailures is negative', () => {
      expect(() => new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
        { maxRecentFailures: -1 },
      )).toThrow('maxRecentFailures must be a non-negative integer');
    });

    it('throws when maxRecentFailures is not an integer', () => {
      expect(() => new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
        { maxRecentFailures: 1.5 },
      )).toThrow('maxRecentFailures must be a non-negative integer');
    });

    it('accepts valid config', () => {
      expect(() => new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
        { rollingScoreThreshold: 0.7, maxRecentFailures: 2 },
      )).not.toThrow();
    });
  });

  describe('inspectAndApply', () => {
    const ranking = [makeRanked('a:a:a', 0.9, 1)];

    it('applies recommendation when all criteria met', async () => {
      const result = await service.inspectAndApply(
        'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
      expect(result!.familyKey).toBe('fam:test');
      expect(result!.riskBasis).toBe('low');
      expect(result!.mode).toBe('auto_apply_low_risk');
      expect(result!.reason).toContain('Low-risk auto-apply');
    });

    it('saves decision record and applies state', async () => {
      await service.inspectAndApply(
        'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
      );
      expect(decisionWriter.records).toHaveLength(1);
      expect(stateApplier.applied).toHaveLength(1);
    });

    it('works without stateApplier', async () => {
      const serviceNoApplier = new LowRiskAutoApplyService(
        riskProvider, postureProvider, failureCounter, decisionWriter,
      );
      const result = await serviceNoApplier.inspectAndApply(
        'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
      expect(stateApplier.applied).toHaveLength(0); // not called
    });

    describe('rejection criteria', () => {
      it('returns null when mode does not permit auto-apply', async () => {
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'observe_only',
        );
        expect(result).toBeNull();
      });

      it('returns null when mode is recommend_only', async () => {
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'recommend_only',
        );
        expect(result).toBeNull();
      });

      it('returns null when risk level is high', async () => {
        riskProvider.riskMap.set('fam:test', 'high');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'fully_applied',
        );
        expect(result).toBeNull();
      });

      it('returns null when risk is medium and mode is auto_apply_low_risk', async () => {
        riskProvider.riskMap.set('fam:test', 'medium');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).toBeNull();
      });

      it('returns null when posture is not qualifying (final)', async () => {
        postureProvider.postureMap.set('fam:test', 'final');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).toBeNull();
      });

      it('returns null when posture is evidentiary', async () => {
        postureProvider.postureMap.set('fam:test', 'evidentiary');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).toBeNull();
      });

      it('returns null when recent failures exceed threshold', async () => {
        failureCounter.failureMap.set('fam:test', 1);
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).toBeNull();
      });

      it('returns null when rolling score is below threshold', async () => {
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState({ rollingScore: 0.3 }), ranking, 'auto_apply_low_risk',
        );
        expect(result).toBeNull();
      });
    });

    describe('qualifying postures', () => {
      it('accepts exploratory posture', async () => {
        postureProvider.postureMap.set('fam:test', 'exploratory');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).not.toBeNull();
      });

      it('accepts advisory posture', async () => {
        postureProvider.postureMap.set('fam:test', 'advisory');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).not.toBeNull();
      });

      it('accepts operational posture', async () => {
        postureProvider.postureMap.set('fam:test', 'operational');
        const result = await service.inspectAndApply(
          'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'auto_apply_low_risk',
        );
        expect(result).not.toBeNull();
      });
    });

    it('applies with fully_applied mode and low risk', async () => {
      const result = await service.inspectAndApply(
        'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'fully_applied',
      );
      expect(result).not.toBeNull();
    });

    it('applies with fully_applied mode and medium risk', async () => {
      riskProvider.riskMap.set('fam:test', 'medium');
      const result = await service.inspectAndApply(
        'fam:test', makeRecommendation(), makeFamilyState(), ranking, 'fully_applied',
      );
      expect(result).not.toBeNull();
    });
  });
});
