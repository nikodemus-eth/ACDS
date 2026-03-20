// ---------------------------------------------------------------------------
// Integration Tests -- Low-Risk Auto-Apply (Prompt 68)
// PGlite-backed where applicable. Static* providers for domain defaults.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// -- Static providers (legitimate defaults, not mocks) -----------------------

class StaticRiskProvider implements FamilyRiskProvider {
  private risks = new Map<string, FamilyRiskLevel>();

  setRisk(familyKey: string, level: FamilyRiskLevel) {
    this.risks.set(familyKey, level);
  }

  async getRiskLevel(familyKey: string): Promise<FamilyRiskLevel> {
    return this.risks.get(familyKey) ?? 'low';
  }
}

class StaticPostureProvider implements FamilyPostureProvider {
  private postures = new Map<string, string>();

  setPosture(familyKey: string, posture: string) {
    this.postures.set(familyKey, posture);
  }

  async getPosture(familyKey: string): Promise<string> {
    return this.postures.get(familyKey) ?? 'exploratory';
  }
}

class StaticFailureCounter implements RecentFailureCounter {
  private counts = new Map<string, number>();

  setCount(familyKey: string, count: number) {
    this.counts.set(familyKey, count);
  }

  async countRecentFailures(familyKey: string): Promise<number> {
    return this.counts.get(familyKey) ?? 0;
  }
}

/**
 * PG-backed decision writer: persists to auto_apply_decision_records
 * and exposes records for assertion.
 */
class PgAutoApplyDecisionWriter implements AutoApplyDecisionWriter {
  constructor(private readonly pgPool: PoolLike) {}

  async save(record: AutoApplyDecisionRecord): Promise<void> {
    await this.pgPool.query(
      `INSERT INTO auto_apply_decision_records
        (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.familyKey,
        JSON.stringify(record.previousRanking),
        JSON.stringify(record.newRanking),
        record.reason,
        record.mode,
        record.riskBasis,
        record.appliedAt,
      ],
    );
  }

  async count(): Promise<number> {
    const result = await this.pgPool.query('SELECT count(*) FROM auto_apply_decision_records');
    return Number(result.rows[0].count);
  }

  async findAll(): Promise<Record<string, unknown>[]> {
    const result = await this.pgPool.query('SELECT * FROM auto_apply_decision_records ORDER BY created_at');
    return result.rows;
  }
}

// -- Test fixtures -----------------------------------------------------------

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

describe('Low-Risk Auto-Apply -- Qualification', () => {
  let riskProvider: StaticRiskProvider;
  let postureProvider: StaticPostureProvider;
  let failureCounter: StaticFailureCounter;
  let decisionWriter: PgAutoApplyDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new StaticRiskProvider();
    postureProvider = new StaticPostureProvider();
    failureCounter = new StaticFailureCounter();
    decisionWriter = new PgAutoApplyDecisionWriter(pool);
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

  it('qualifies for operational posture', async () => {
    postureProvider.setPosture('test.family.advisory', 'operational');

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

describe('Low-Risk Auto-Apply -- Adaptive Reordering', () => {
  let riskProvider: StaticRiskProvider;
  let postureProvider: StaticPostureProvider;
  let failureCounter: StaticFailureCounter;
  let decisionWriter: PgAutoApplyDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new StaticRiskProvider();
    postureProvider = new StaticPostureProvider();
    failureCounter = new StaticFailureCounter();
    decisionWriter = new PgAutoApplyDecisionWriter(pool);
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

    const count = await decisionWriter.count();
    expect(count).toBe(1);
    const rows = await decisionWriter.findAll();
    expect(rows[0].family_key).toBe('test.family.advisory');
  });
});

// ===========================================================================
// Refusal for High-Consequence Families
// ===========================================================================

describe('Low-Risk Auto-Apply -- High-Consequence Refusal', () => {
  let riskProvider: StaticRiskProvider;
  let postureProvider: StaticPostureProvider;
  let failureCounter: StaticFailureCounter;
  let decisionWriter: PgAutoApplyDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new StaticRiskProvider();
    postureProvider = new StaticPostureProvider();
    failureCounter = new StaticFailureCounter();
    decisionWriter = new PgAutoApplyDecisionWriter(pool);
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

describe('Low-Risk Auto-Apply -- Audit Recording', () => {
  let riskProvider: StaticRiskProvider;
  let postureProvider: StaticPostureProvider;
  let failureCounter: StaticFailureCounter;
  let decisionWriter: PgAutoApplyDecisionWriter;
  let service: LowRiskAutoApplyService;

  beforeEach(() => {
    riskProvider = new StaticRiskProvider();
    postureProvider = new StaticPostureProvider();
    failureCounter = new StaticFailureCounter();
    decisionWriter = new PgAutoApplyDecisionWriter(pool);
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

    const count = await decisionWriter.count();
    expect(count).toBe(0);
  });
});

// ===========================================================================
// Config Validation
// ===========================================================================

describe('Low-Risk Auto-Apply -- Config Validation', () => {
  it('throws when rollingScoreThreshold is out of range (> 1)', () => {
    expect(() =>
      new LowRiskAutoApplyService(
        new StaticRiskProvider(),
        new StaticPostureProvider(),
        new StaticFailureCounter(),
        new PgAutoApplyDecisionWriter(pool),
        { rollingScoreThreshold: 1.5 },
      ),
    ).toThrow('rollingScoreThreshold must be between 0 and 1');
  });

  it('throws when rollingScoreThreshold is negative', () => {
    expect(() =>
      new LowRiskAutoApplyService(
        new StaticRiskProvider(),
        new StaticPostureProvider(),
        new StaticFailureCounter(),
        new PgAutoApplyDecisionWriter(pool),
        { rollingScoreThreshold: -0.1 },
      ),
    ).toThrow('rollingScoreThreshold must be between 0 and 1');
  });

  it('throws when maxRecentFailures is negative', () => {
    expect(() =>
      new LowRiskAutoApplyService(
        new StaticRiskProvider(),
        new StaticPostureProvider(),
        new StaticFailureCounter(),
        new PgAutoApplyDecisionWriter(pool),
        { maxRecentFailures: -1 },
      ),
    ).toThrow('maxRecentFailures must be a non-negative integer');
  });

  it('throws when maxRecentFailures is not an integer', () => {
    expect(() =>
      new LowRiskAutoApplyService(
        new StaticRiskProvider(),
        new StaticPostureProvider(),
        new StaticFailureCounter(),
        new PgAutoApplyDecisionWriter(pool),
        { maxRecentFailures: 1.5 },
      ),
    ).toThrow('maxRecentFailures must be a non-negative integer');
  });
});
