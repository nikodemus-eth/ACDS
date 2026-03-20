// ---------------------------------------------------------------------------
// Integration Tests -- Adaptation Rollback (Prompt 68)
// PGlite-backed: no InMemory/Mock/Stub classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AdaptationRollbackService,
} from '@acds/adaptive-optimizer';
import type {
  AdaptationEvent,
  CandidatePerformanceState,
  RankedCandidate,
} from '@acds/adaptive-optimizer';
import {
  PgAdaptationEventRepository,
  PgOptimizerStateRepository,
  PgRollbackRecordWriter,
  PgRollbackAuditEmitter,
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

// -- Fixtures ----------------------------------------------------------------

const FAMILY_KEY = 'test.family.advisory';
const EVENT_ID = randomUUID();

function makeCandidate(id: string, score: number): CandidatePerformanceState {
  return {
    candidateId: id,
    familyKey: FAMILY_KEY,
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

function makeAdaptationEvent(overrides?: Partial<AdaptationEvent>): AdaptationEvent {
  return {
    id: EVENT_ID,
    familyKey: FAMILY_KEY,
    trigger: 'plateau_detected',
    mode: 'recommend_only',
    previousRanking: [
      makeRankedCandidate('candidate-a', 1, 0.80),
      makeRankedCandidate('candidate-b', 2, 0.70),
    ],
    newRanking: [
      makeRankedCandidate('candidate-b', 1, 0.85),
      makeRankedCandidate('candidate-a', 2, 0.75),
    ],
    policyBoundsSnapshot: {
      maxCandidates: 5,
      explorationRate: 0.1,
      maxExplorationRate: 0.3,
    },
    evidenceSummary: 'Plateau detected. Reranking candidates.',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as AdaptationEvent;
}

function createDeps() {
  const pgPool = pool as any;
  const ledger = new PgAdaptationEventRepository(pgPool);
  const optimizerRepo = new PgOptimizerStateRepository(pgPool);
  const rollbackWriter = new PgRollbackRecordWriter(pgPool);
  const auditEmitter = new PgRollbackAuditEmitter(pgPool);
  const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
  return { ledger, optimizerRepo, rollbackWriter, auditEmitter, service };
}

async function setupDefaults(deps: ReturnType<typeof createDeps>) {
  await deps.ledger.writeEvent(makeAdaptationEvent());

  await deps.optimizerRepo.saveFamilyState({
    familyKey: FAMILY_KEY,
    currentCandidateId: 'candidate-b',
    rollingScore: 0.85,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
  });

  await deps.optimizerRepo.saveCandidateState(makeCandidate('candidate-b', 0.85));
  await deps.optimizerRepo.saveCandidateState(makeCandidate('candidate-a', 0.75));
}

// ===========================================================================
// Rollback Preview
// ===========================================================================

describe('Adaptation Rollback -- Preview', () => {
  it('returns a preview without mutating state', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    const preview = await deps.service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview).toBeDefined();
    expect(preview.preview.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.targetAdaptationEventId).toBe(EVENT_ID);
    // No rollback records should be persisted from preview
    const result = await pool.query('SELECT count(*) FROM adaptation_rollback_records');
    expect(Number(result.rows[0].count)).toBe(0);
  });

  it('includes current and restored snapshots', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    const preview = await deps.service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview.preview.previousSnapshot.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.previousSnapshot.candidateRankings.length).toBeGreaterThan(0);
    expect(preview.preview.restoredSnapshot.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.restoredSnapshot.candidateRankings.length).toBeGreaterThan(0);
  });

  it('marks a recent event as safe', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    const preview = await deps.service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview.safe).toBe(true);
    expect(preview.warnings).toHaveLength(0);
  });

  it('flags a very old event as unsafe', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await deps.ledger.writeEvent(makeAdaptationEvent({ id: 'old-event', createdAt: oldDate }));

    const preview = await deps.service.previewRollback(FAMILY_KEY, 'old-event');

    expect(preview.safe).toBe(false);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(preview.warnings[0]).toContain('days old');
  });
});

// ===========================================================================
// Rollback Execution
// ===========================================================================

describe('Adaptation Rollback -- Execution', () => {
  it('executes a safe rollback successfully', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    const record = await deps.service.executeRollback(
      FAMILY_KEY,
      EVENT_ID,
      'operator@acds',
      'Performance degradation after last change.',
    );

    expect(record.id).toBeDefined();
    expect(record.familyKey).toBe(FAMILY_KEY);
    expect(record.targetAdaptationEventId).toBe(EVENT_ID);
    expect(record.actor).toBe('operator@acds');
    expect(record.reason).toBe('Performance degradation after last change.');
  });

  it('persists the rollback record', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await deps.service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', 'Rolling back');

    const result = await pool.query('SELECT * FROM adaptation_rollback_records WHERE family_key = $1', [FAMILY_KEY]);
    expect(result.rows.length).toBe(1);
  });
});

// ===========================================================================
// Invalid Rollback Rejection
// ===========================================================================

describe('Adaptation Rollback -- Invalid Rejection', () => {
  it('throws when the target event does not exist', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await expect(
      deps.service.executeRollback(FAMILY_KEY, 'nonexistent', 'operator@acds', 'Test'),
    ).rejects.toThrow(/not found/);
  });

  it('throws when the event belongs to a different family', async () => {
    const deps = createDeps();
    await setupDefaults(deps);
    await deps.ledger.writeEvent(makeAdaptationEvent({ id: 'other-event', familyKey: 'other.family' }));

    await expect(
      deps.service.executeRollback(FAMILY_KEY, 'other-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/belongs to family/);
  });

  it('throws when family state does not exist', async () => {
    const deps = createDeps();
    await setupDefaults(deps);
    await deps.ledger.writeEvent(makeAdaptationEvent({ id: 'orphan-event', familyKey: 'orphan.family' }));

    await expect(
      deps.service.executeRollback('orphan.family', 'orphan-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/state not found/);
  });

  it('refuses execution for unsafe rollbacks (old events)', async () => {
    const deps = createDeps();
    await setupDefaults(deps);
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await deps.ledger.writeEvent(makeAdaptationEvent({ id: 'old-event', createdAt: oldDate }));

    await expect(
      deps.service.executeRollback(FAMILY_KEY, 'old-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/not safe/);
  });
});

// ===========================================================================
// Rollback Audit Emission
// ===========================================================================

describe('Adaptation Rollback -- Audit Emission', () => {
  it('emits a rollback_executed audit event on successful execution', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await deps.service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', 'Performance issue');

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE resource_type = 'rollback' AND action = 'rollback_executed'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('does not emit audit events for failed rollbacks', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    try {
      await deps.service.executeRollback(FAMILY_KEY, 'nonexistent', 'operator@acds', 'Test');
    } catch {
      // Expected
    }

    const result = await pool.query(
      `SELECT * FROM audit_events WHERE resource_type = 'rollback'`,
    );
    expect(result.rows.length).toBe(0);
  });
});

// ===========================================================================
// Rollback Input Validation
// ===========================================================================

describe('Adaptation Rollback -- Input Validation', () => {
  it('throws when actor is empty', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await expect(
      deps.service.executeRollback(FAMILY_KEY, EVENT_ID, '', 'Reason'),
    ).rejects.toThrow('actor is required');
  });

  it('throws when actor is whitespace only', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await expect(
      deps.service.executeRollback(FAMILY_KEY, EVENT_ID, '   ', 'Reason'),
    ).rejects.toThrow('actor is required');
  });

  it('throws when reason is empty', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await expect(
      deps.service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', ''),
    ).rejects.toThrow('reason is required');
  });

  it('throws when reason is whitespace only', async () => {
    const deps = createDeps();
    await setupDefaults(deps);

    await expect(
      deps.service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', '   '),
    ).rejects.toThrow('reason is required');
  });

  it('flags event with empty previous ranking as unsafe', async () => {
    const deps = createDeps();
    await setupDefaults(deps);
    await deps.ledger.writeEvent(makeAdaptationEvent({
      id: 'empty-ranking-event',
      previousRanking: [],
    }));

    const preview = await deps.service.previewRollback(FAMILY_KEY, 'empty-ranking-event');
    expect(preview.safe).toBe(false);
    expect(preview.warnings.some((w) => w.includes('empty previous ranking'))).toBe(true);
  });
});
