// ---------------------------------------------------------------------------
// Integration Tests -- Adaptation API (Prompt 59)
// PGlite-backed: uses real PG repositories, no Mock/InMemory classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  PgOptimizerStateRepository,
  PgAdaptationEventRepository,
  PgAdaptationApprovalRepository,
} from '@acds/persistence-pg';
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

// -- Seed helpers ------------------------------------------------------------

function createRepos() {
  const pgPool = pool as any;
  return {
    optimizerRepo: new PgOptimizerStateRepository(pgPool),
    eventRepo: new PgAdaptationEventRepository(pgPool),
    approvalRepo: new PgAdaptationApprovalRepository(pgPool),
  };
}

async function seedFamilyStates(optimizerRepo: PgOptimizerStateRepository) {
  await optimizerRepo.saveFamilyState({
    familyKey: 'thingstead.governance.advisory',
    currentCandidateId: 'profile-local',
    rollingScore: 0.82,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: new Date(Date.now() - 3_600_000).toISOString(),
    recentTrend: 'stable',
  });

  await optimizerRepo.saveFamilyState({
    familyKey: 'process-swarm.generation.draft',
    currentCandidateId: 'profile-fast',
    rollingScore: 0.71,
    explorationRate: 0.1,
    plateauDetected: true,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
  });

  await optimizerRepo.saveFamilyState({
    familyKey: 'thingstead.legal.review',
    currentCandidateId: 'profile-strong',
    rollingScore: 0.90,
    explorationRate: 0.05,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
  });
}

async function seedEvents(eventRepo: PgAdaptationEventRepository) {
  const now = Date.now();
  await eventRepo.writeEvent({
    id: 'evt-001',
    familyKey: 'thingstead.governance.advisory',
    trigger: 'scheduled',
    mode: 'auto_apply_low_risk',
    previousRanking: [],
    newRanking: [],
    policyBoundsSnapshot: { explorationRate: 0.1, mode: 'auto_apply_low_risk', additionalConstraints: {} },
    evidenceSummary: 'adaptive selection found local profile scoring higher',
    createdAt: new Date(now - 3_600_000).toISOString(),
  } as any);

  await eventRepo.writeEvent({
    id: 'evt-002',
    familyKey: 'process-swarm.generation.draft',
    trigger: 'plateau_detected',
    mode: 'recommend_only',
    previousRanking: [],
    newRanking: [],
    policyBoundsSnapshot: { explorationRate: 0.1, mode: 'recommend_only', additionalConstraints: {} },
    evidenceSummary: 'flat quality score over 5 evaluation windows',
    createdAt: new Date(now - 1_800_000).toISOString(),
  } as any);

  await eventRepo.writeEvent({
    id: 'evt-003',
    familyKey: 'thingstead.governance.advisory',
    trigger: 'manual',
    mode: 'auto_apply_low_risk',
    previousRanking: [],
    newRanking: [],
    policyBoundsSnapshot: { explorationRate: 0.1, mode: 'auto_apply_low_risk', additionalConstraints: {} },
    evidenceSummary: 'exploration policy triggered for low-consequence family',
    createdAt: new Date(now - 900_000).toISOString(),
  } as any);
}

async function seedRecommendations(approvalRepo: PgAdaptationApprovalRepository) {
  const now = Date.now();
  await approvalRepo.save({
    id: 'rec-001',
    familyKey: 'process-swarm.generation.draft',
    recommendationId: 'rec-001',
    status: 'pending',
    submittedAt: new Date(now - 1_200_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
  });
  await approvalRepo.save({
    id: 'rec-002',
    familyKey: 'thingstead.governance.advisory',
    recommendationId: 'rec-002',
    status: 'pending',
    submittedAt: new Date(now - 600_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
  });
}

// ===========================================================================
// Family State Queries
// ===========================================================================

describe('Adaptation API -- Family State Queries', () => {
  it('returns all adaptation family states', async () => {
    const { optimizerRepo } = createRepos();
    await seedFamilyStates(optimizerRepo);

    const families = await optimizerRepo.listFamilies();
    expect(families.length).toBe(3);
  });

  it('each family state has the expected shape', async () => {
    const { optimizerRepo } = createRepos();
    await seedFamilyStates(optimizerRepo);

    const state = await optimizerRepo.getFamilyState('thingstead.governance.advisory');
    expect(state).toBeDefined();
    expect(state!.familyKey).toBe('thingstead.governance.advisory');
    expect(state!.currentCandidateId).toBe('profile-local');
    expect(state!.rollingScore).toBeCloseTo(0.82);
    expect(state!.explorationRate).toBeCloseTo(0.1);
    expect(typeof state!.plateauDetected).toBe('boolean');
    expect(state!.lastAdaptationAt).toBeDefined();
    expect(state!.recentTrend).toBe('stable');
  });

  it('includes families from different applications', async () => {
    const { optimizerRepo } = createRepos();
    await seedFamilyStates(optimizerRepo);

    const families = await optimizerRepo.listFamilies();
    const hasThingstead = families.some((f) => f.startsWith('thingstead'));
    const hasProcessSwarm = families.some((f) => f.startsWith('process-swarm'));

    expect(hasThingstead).toBe(true);
    expect(hasProcessSwarm).toBe(true);
  });
});

// ===========================================================================
// Family Detail by Key
// ===========================================================================

describe('Adaptation API -- Family Detail by Key', () => {
  it('returns detail for a known family key', async () => {
    const { optimizerRepo } = createRepos();
    await seedFamilyStates(optimizerRepo);

    const state = await optimizerRepo.getFamilyState('thingstead.governance.advisory');
    expect(state).toBeDefined();
    expect(state!.familyKey).toBe('thingstead.governance.advisory');
  });

  it('returns undefined for an unknown family key', async () => {
    const { optimizerRepo } = createRepos();

    const state = await optimizerRepo.getFamilyState('nonexistent.family.key');
    expect(state).toBeUndefined();
  });
});

// ===========================================================================
// Adaptation Events
// ===========================================================================

describe('Adaptation API -- Adaptation Events', () => {
  it('returns all adaptation events', async () => {
    const { eventRepo } = createRepos();
    await seedEvents(eventRepo);

    const events = await eventRepo.find({});
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3);
  });

  it('each event has the expected shape', async () => {
    const { eventRepo } = createRepos();
    await seedEvents(eventRepo);

    const events = await eventRepo.find({});
    for (const event of events) {
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('familyKey');
      expect(event).toHaveProperty('trigger');
      expect(event).toHaveProperty('evidenceSummary');
      expect(event).toHaveProperty('createdAt');
    }
  });

  it('filters events by family key', async () => {
    const { eventRepo } = createRepos();
    await seedEvents(eventRepo);

    const events = await eventRepo.listEvents('thingstead.governance.advisory');
    expect(events.length).toBe(2);
    events.forEach((e) => {
      expect(e.familyKey).toBe('thingstead.governance.advisory');
    });
  });
});

// ===========================================================================
// Pending Approvals (Recommendations)
// ===========================================================================

describe('Adaptation API -- Pending Approvals', () => {
  it('returns all pending approvals', async () => {
    const { approvalRepo } = createRepos();
    await seedRecommendations(approvalRepo);

    const pending = await approvalRepo.findPending();
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.length).toBe(2);
  });

  it('each pending approval has the expected shape', async () => {
    const { approvalRepo } = createRepos();
    await seedRecommendations(approvalRepo);

    const pending = await approvalRepo.findPending();
    for (const rec of pending) {
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('familyKey');
      expect(rec).toHaveProperty('recommendationId');
      expect(rec).toHaveProperty('status');
      expect(rec.status).toBe('pending');
    }
  });

  it('approvals reference different families', async () => {
    const { approvalRepo } = createRepos();
    await seedRecommendations(approvalRepo);

    const pending = await approvalRepo.findPending();
    const families = new Set(pending.map((r) => r.familyKey));
    expect(families.size).toBe(2);
  });
});
