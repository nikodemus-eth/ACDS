// ---------------------------------------------------------------------------
// Integration Tests – Low-Risk Auto-Apply (Prompt 68)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  LowRiskAutoApplyService,
  type FamilyRiskProvider,
  type FamilyPostureProvider,
  type RecentFailureCounter,
  type AutoApplyDecisionWriter,
  type FamilyRiskLevel,
} from '@acds/adaptive-optimizer';
import type {
  AdaptationRecommendation,
  FamilySelectionState,
  RankedCandidate,
  CandidatePerformanceState,
  AutoApplyDecisionRecord,
} from '@acds/adaptive-optimizer';

// ── Test helpers ──────────────────────────────────────────────────────────

class MockRiskProvider implements FamilyRiskProvider {
  private risks = new Map<string, FamilyRiskLevel>();

  setRisk(familyKey: string, level: FamilyRiskLevel) {
    this.risks.set(familyKey, level);
  }

  async getRiskLevel(familyKey: string): Promise<FamilyRiskLevel> {
    return this.risks.get(familyKey) ?? 'low';
  }
}

class MockPostureProvider implements FamilyPostureProvider {
  private postures = new Map<string, string>();

  setPosture(familyKey: string, posture: string) {
    this.postures.set(familyKey, posture);
  }

  async getPosture(familyKey: string): Promise<string> {
    return this.postures.get(familyKey) ?? 'exploratory';
  }
}

class MockFailureCounter implements RecentFailureCounter {
  private counts = new Map<string, number>();

  setCount(familyKey: string, count: number) {
    this.counts.set(familyKey, count);
  }

  async countRecentFailures(familyKey: string): Promise<number> {
    return this.counts.get(familyKey) ?? 0;
  }
}

class CollectingDecisionWriter implements AutoApplyDecisionWriter {
  readonly records: AutoApplyDecisionRecord[] = [];

  async save(record: AutoApplyDecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

function makeFamilyState(overrides?: Partial<FamilySelectionState>): FamilySelectionState {
  return {
    familyKey: 'test.family.advisory',
    currentCandidateId: 'candidate-a',
    rollingScore: 0.75,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
    ...overrides,
  };
}

function makeCandidate(id: string, score: number): CandidatePerformanceState {
  return {
    candidateId: id,
    familyKey: 'test.family.advisory',
    rollingScore: score,
    runCount: 25,
    successRate: 0.9,
    averageLatency: 500,
    lastSelectedAt: new Date().toISOString(),
  };
}

function makeRankedCandidate(id: string, rank: number, score: number): RankedCandidate {
  return {
    candidate: makeCandidate(id, score),
    rank,
    compositeScore: score,
    scoreBreakdown: {
      performanceComponent: score,
      recencyComponent: 0.5,
      successRateComponent: 0.9,
    },
  };
}

function makeRecommendation(overrides?: Partial<AdaptationRecommendation>): AdaptationRecommendation {
  return {
    id: randomUUID(),
    familyKey: 'test.family.advisory',
    recommendedRanking: [
      makeRankedCandidate('candidate-b', 1, 0.88),
      makeRankedCandidate('candidate-a', 2, 0.75),
    ],
    evidence: 'Test evidence',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ===========================================================================
// Low-Risk Qualification
// ===========================================================================

describe('Low-Risk Auto-Apply – Qualification', () => {
  let riskProvider: MockRiskProvider;
  let postureProvider: MockPostureProvider;
  let failureCounter: MockFailureCounter;
  let decisionWriter: CollectingDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new MockRiskProvider();
    postureProvider = new MockPostureProvider();
    failureCounter = new MockFailureCounter();
    decisionWriter = new CollectingDecisionWriter();
    service = new LowRiskAutoApplyService(
      riskProvider,
      postureProvider,
      failureCounter,
      decisionWriter,
    );
  });

  it('auto-applies when all low-risk criteria are met', async () => {
    riskProvider.setRisk('test.family.advisory', 'low');
    postureProvider.setPosture('test.family.advisory', 'exploratory');
    failureCounter.setCount('test.family.advisory', 0);

    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [makeRankedCandidate('candidate-a', 1, 0.75)],
      'auto_apply_low_risk',
    );

    expect(result).not.toBeNull();
    expect(result!.familyKey).toBe('test.family.advisory');
    expect(result!.mode).toBe('auto_apply_low_risk');
    expect(result!.riskBasis).toBe('low');
  });

  it('qualifies for advisory posture', async () => {
    postureProvider.setPosture('test.family.advisory', 'advisory');

    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [],
      'auto_apply_low_risk',
    );

    expect(result).not.toBeNull();
  });

  it('qualifies for draft posture', async () => {
    postureProvider.setPosture('test.family.advisory', 'draft');

    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [],
      'auto_apply_low_risk',
    );

    expect(result).not.toBeNull();
  });
});

// ===========================================================================
// Adaptive Reordering
// ===========================================================================

describe('Low-Risk Auto-Apply – Adaptive Reordering', () => {
  let riskProvider: MockRiskProvider;
  let postureProvider: MockPostureProvider;
  let failureCounter: MockFailureCounter;
  let decisionWriter: CollectingDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new MockRiskProvider();
    postureProvider = new MockPostureProvider();
    failureCounter = new MockFailureCounter();
    decisionWriter = new CollectingDecisionWriter();
    service = new LowRiskAutoApplyService(
      riskProvider,
      postureProvider,
      failureCounter,
      decisionWriter,
    );
  });

  it('records the previous and new ranking in the decision', async () => {
    const currentRanking = [makeRankedCandidate('candidate-a', 1, 0.75)];
    const rec = makeRecommendation();

    const result = await service.inspectAndApply(
      'test.family.advisory',
      rec,
      makeFamilyState(),
      currentRanking,
      'auto_apply_low_risk',
    );

    expect(result).not.toBeNull();
    expect(result!.previousRanking).toEqual(currentRanking);
    expect(result!.newRanking).toEqual(rec.recommendedRanking);
  });

  it('persists the decision record via the writer', async () => {
    await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [],
      'auto_apply_low_risk',
    );

    expect(decisionWriter.records).toHaveLength(1);
    expect(decisionWriter.records[0].familyKey).toBe('test.family.advisory');
  });
});

// ===========================================================================
// Refusal for High-Consequence Families
// ===========================================================================

describe('Low-Risk Auto-Apply – High-Consequence Refusal', () => {
  let riskProvider: MockRiskProvider;
  let postureProvider: MockPostureProvider;
  let failureCounter: MockFailureCounter;
  let decisionWriter: CollectingDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new MockRiskProvider();
    postureProvider = new MockPostureProvider();
    failureCounter = new MockFailureCounter();
    decisionWriter = new CollectingDecisionWriter();
    service = new LowRiskAutoApplyService(
      riskProvider,
      postureProvider,
      failureCounter,
      decisionWriter,
    );
  });

  it('refuses auto-apply for high-risk families', async () => {
    riskProvider.setRisk('test.family.legal', 'high');

    const result = await service.inspectAndApply(
      'test.family.legal',
      makeRecommendation({ familyKey: 'test.family.legal' }),
      makeFamilyState({ familyKey: 'test.family.legal' }),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });

  it('refuses auto-apply for medium-risk families in auto_apply_low_risk mode', async () => {
    riskProvider.setRisk('test.family.medium', 'medium');

    const result = await service.inspectAndApply(
      'test.family.medium',
      makeRecommendation({ familyKey: 'test.family.medium' }),
      makeFamilyState({ familyKey: 'test.family.medium' }),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });

  it('refuses auto-apply for final posture families', async () => {
    postureProvider.setPosture('test.family.final', 'final');

    const result = await service.inspectAndApply(
      'test.family.final',
      makeRecommendation({ familyKey: 'test.family.final' }),
      makeFamilyState({ familyKey: 'test.family.final' }),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });

  it('refuses auto-apply for evidentiary posture families', async () => {
    postureProvider.setPosture('test.family.evidentiary', 'evidentiary');

    const result = await service.inspectAndApply(
      'test.family.evidentiary',
      makeRecommendation({ familyKey: 'test.family.evidentiary' }),
      makeFamilyState({ familyKey: 'test.family.evidentiary' }),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });

  it('refuses auto-apply when there are recent failures', async () => {
    failureCounter.setCount('test.family.advisory', 3);

    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });

  it('refuses auto-apply when rolling score is below threshold', async () => {
    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState({ rollingScore: 0.3 }),
      [],
      'auto_apply_low_risk',
    );

    expect(result).toBeNull();
  });
});

// ===========================================================================
// Audit Recording
// ===========================================================================

describe('Low-Risk Auto-Apply – Audit Recording', () => {
  let riskProvider: MockRiskProvider;
  let postureProvider: MockPostureProvider;
  let failureCounter: MockFailureCounter;
  let decisionWriter: CollectingDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new MockRiskProvider();
    postureProvider = new MockPostureProvider();
    failureCounter = new MockFailureCounter();
    decisionWriter = new CollectingDecisionWriter();
    service = new LowRiskAutoApplyService(
      riskProvider,
      postureProvider,
      failureCounter,
      decisionWriter,
    );
  });

  it('decision record includes all required audit fields', async () => {
    const result = await service.inspectAndApply(
      'test.family.advisory',
      makeRecommendation(),
      makeFamilyState(),
      [],
      'auto_apply_low_risk',
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.familyKey).toBe('test.family.advisory');
    expect(result!.mode).toBe('auto_apply_low_risk');
    expect(result!.riskBasis).toBe('low');
    expect(result!.appliedAt).toBeDefined();
    expect(result!.reason).toContain('Low-risk auto-apply');
    expect(result!.reason).toContain('posture=');
    expect(result!.reason).toContain('risk=');
    expect(result!.reason).toContain('rollingScore=');
  });

  it('does not persist a record when auto-apply is refused', async () => {
    riskProvider.setRisk('test.family.legal', 'high');

    await service.inspectAndApply(
      'test.family.legal',
      makeRecommendation({ familyKey: 'test.family.legal' }),
      makeFamilyState({ familyKey: 'test.family.legal' }),
      [],
      'auto_apply_low_risk',
    );

    expect(decisionWriter.records).toHaveLength(0);
  });
});
