// ---------------------------------------------------------------------------
// Integration Tests -- Adaptive Control API (Prompt 68)
// PGlite-backed: uses real PG repositories and services, no Mock classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AdaptationApprovalService,
  AdaptationRollbackService,
} from '@acds/adaptive-optimizer';
import type { AdaptationApproval } from '@acds/adaptive-optimizer';
import {
  PgAdaptationApprovalRepository,
  PgApprovalAuditEmitter,
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

// -- Helpers -----------------------------------------------------------------

function createApprovalService() {
  const pgPool = pool as any;
  const repo = new PgAdaptationApprovalRepository(pgPool);
  const emitter = new PgApprovalAuditEmitter(pgPool);
  const service = new AdaptationApprovalService(repo, emitter);
  return { repo, emitter, service };
}

function createRollbackService() {
  const pgPool = pool as any;
  const ledger = new PgAdaptationEventRepository(pgPool);
  const optimizerRepo = new PgOptimizerStateRepository(pgPool);
  const rollbackWriter = new PgRollbackRecordWriter(pgPool);
  const auditEmitter = new PgRollbackAuditEmitter(pgPool);
  const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
  return { ledger, optimizerRepo, rollbackWriter, auditEmitter, service };
}

async function seedApprovals(repo: PgAdaptationApprovalRepository) {
  const now = Date.now();
  await repo.save({
    id: 'approval-001',
    familyKey: 'test.family.advisory',
    recommendationId: 'rec-001',
    status: 'pending',
    submittedAt: new Date(now - 3_600_000).toISOString(),
    expiresAt: new Date(now + 20_400_000).toISOString(),
  });
  await repo.save({
    id: 'approval-002',
    familyKey: 'test.family.draft',
    recommendationId: 'rec-002',
    status: 'approved',
    submittedAt: new Date(now - 7_200_000).toISOString(),
    expiresAt: new Date(now + 16_800_000).toISOString(),
    decidedAt: new Date(now - 1_800_000).toISOString(),
    decidedBy: 'operator@acds',
    reason: 'Evidence is clear',
  });
  await repo.save({
    id: 'approval-003',
    familyKey: 'test.family.advisory',
    recommendationId: 'rec-003',
    status: 'rejected',
    submittedAt: new Date(now - 10_800_000).toISOString(),
    expiresAt: new Date(now + 13_200_000).toISOString(),
    decidedAt: new Date(now - 5_400_000).toISOString(),
    decidedBy: 'reviewer@acds',
    reason: 'Insufficient evidence',
  });
  await repo.save({
    id: 'approval-004',
    familyKey: 'test.family.final',
    recommendationId: 'rec-004',
    status: 'expired',
    submittedAt: new Date(now - 86_400_000).toISOString(),
    expiresAt: new Date(now - 3_600_000).toISOString(),
  });
}

function makeSeedCandidate(id: string, score: number): import('@acds/adaptive-optimizer').CandidatePerformanceState {
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

function makeSeedRankedCandidate(id: string, rank: number, score: number): import('@acds/adaptive-optimizer').RankedCandidate {
  return {
    candidate: makeSeedCandidate(id, score),
    rank,
    compositeScore: score,
    scoreBreakdown: {
      performanceComponent: score,
      recencyComponent: 0.5,
      successRateComponent: 0.9,
    },
  };
}

async function seedRollbackScenario(deps: ReturnType<typeof createRollbackService>) {
  const familyKey = 'test.family.advisory';
  await deps.ledger.writeEvent({
    id: 'evt-001',
    familyKey,
    trigger: 'scheduled',
    mode: 'recommend_only',
    previousRanking: [
      makeSeedRankedCandidate('candidate-a', 1, 0.80),
      makeSeedRankedCandidate('candidate-b', 2, 0.70),
    ],
    newRanking: [
      makeSeedRankedCandidate('candidate-b', 1, 0.85),
      makeSeedRankedCandidate('candidate-a', 2, 0.75),
    ],
    policyBoundsSnapshot: { explorationRate: 0.1, mode: 'recommend_only', additionalConstraints: {} },
    evidenceSummary: 'Test event for rollback',
    createdAt: new Date().toISOString(),
  } as any);

  await deps.optimizerRepo.saveFamilyState({
    familyKey,
    currentCandidateId: 'candidate-b',
    rollingScore: 0.85,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
  });

  await deps.optimizerRepo.saveCandidateState({
    candidateId: 'candidate-b',
    familyKey,
    rollingScore: 0.85,
    runCount: 25,
    successRate: 0.9,
    averageLatency: 500,
    lastSelectedAt: new Date().toISOString(),
  });

  await deps.optimizerRepo.saveCandidateState({
    candidateId: 'candidate-a',
    familyKey,
    rollingScore: 0.75,
    runCount: 20,
    successRate: 0.85,
    averageLatency: 550,
    lastSelectedAt: new Date().toISOString(),
  });
}

// ===========================================================================
// Approval Endpoints
// ===========================================================================

describe('Adaptive Control API -- Approval Endpoints', () => {
  it('lists all approvals', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const result = await pool.query('SELECT * FROM adaptation_approval_records');
    expect(result.rows.length).toBe(4);
  });

  it('filters approvals by status', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const pending = await repo.findPending();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe('pending');
  });

  it('filters approvals by family key', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const familyApprovals = await repo.findByFamily('test.family.advisory');
    expect(familyApprovals.length).toBe(2);
    familyApprovals.forEach((a) => {
      expect(a.familyKey).toBe('test.family.advisory');
    });
  });

  it('retrieves a single approval by id', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const approval = await repo.findById('approval-002');
    expect(approval).toBeDefined();
    expect(approval!.id).toBe('approval-002');
    expect(approval!.status).toBe('approved');
  });

  it('returns undefined for unknown approval id', async () => {
    const { repo } = createApprovalService();
    const approval = await repo.findById('nonexistent');
    expect(approval).toBeUndefined();
  });

  it('approves a pending approval', async () => {
    const { service } = createApprovalService();
    const rec = { id: randomUUID(), familyKey: 'test.fam', recommendedRanking: [], evidence: 'test', status: 'pending' as const, createdAt: new Date().toISOString() };
    const approval = await service.submitForApproval(rec);
    const updated = await service.approve(approval.id, 'admin@acds', 'Approved after review');

    expect(updated.status).toBe('approved');
    expect(updated.decidedBy).toBe('admin@acds');
  });

  it('rejects a pending approval', async () => {
    const { service } = createApprovalService();
    const rec = { id: randomUUID(), familyKey: 'test.fam', recommendedRanking: [], evidence: 'test', status: 'pending' as const, createdAt: new Date().toISOString() };
    const approval = await service.submitForApproval(rec);
    const updated = await service.reject(approval.id, 'admin@acds', 'Not sufficient');

    expect(updated.status).toBe('rejected');
  });

  it('rejects approving a non-pending approval', async () => {
    const { service } = createApprovalService();
    const rec = { id: randomUUID(), familyKey: 'test.fam', recommendedRanking: [], evidence: 'test', status: 'pending' as const, createdAt: new Date().toISOString() };
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'admin@acds');

    await expect(
      service.approve(approval.id, 'admin@acds'),
    ).rejects.toThrow(/cannot be modified/);
  });
});

// ===========================================================================
// Rollback Endpoints
// ===========================================================================

describe('Adaptive Control API -- Rollback Endpoints', () => {
  it('returns a rollback preview', async () => {
    const deps = createRollbackService();
    await seedRollbackScenario(deps);

    const preview = await deps.service.previewRollback('test.family.advisory', 'evt-001');
    expect(preview.safe).toBe(true);
    expect(preview.warnings).toHaveLength(0);
  });

  it('executes a rollback successfully', async () => {
    const deps = createRollbackService();
    await seedRollbackScenario(deps);

    const record = await deps.service.executeRollback(
      'test.family.advisory',
      'evt-001',
      'operator@acds',
      'Performance regression detected',
    );

    expect(record.id).toBeDefined();
    expect(record.familyKey).toBe('test.family.advisory');
  });

  it('rejects execution without reason', async () => {
    const deps = createRollbackService();
    await seedRollbackScenario(deps);

    await expect(
      deps.service.executeRollback('test.family.advisory', 'evt-001', 'operator@acds', ''),
    ).rejects.toThrow('reason is required');
  });

  it('rejects execution with missing event', async () => {
    const deps = createRollbackService();
    await seedRollbackScenario(deps);

    await expect(
      deps.service.executeRollback('test.family.advisory', 'nonexistent', 'operator@acds', 'Rolling back'),
    ).rejects.toThrow(/not found/);
  });
});

// ===========================================================================
// Read Surfaces Consistency
// ===========================================================================

describe('Adaptive Control API -- Read Surfaces Consistency', () => {
  it('list and detail endpoints return consistent data', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const all = await pool.query('SELECT * FROM adaptation_approval_records');
    const detail = await repo.findById('approval-001');

    expect(detail).toBeDefined();
    const fromList = all.rows.find((r) => r.id === 'approval-001');
    expect(fromList).toBeDefined();
    expect(fromList!.family_key).toBe(detail!.familyKey);
  });

  it('approved approval reflects in subsequent queries', async () => {
    const { service, repo } = createApprovalService();
    const rec = { id: randomUUID(), familyKey: 'test.fam', recommendedRanking: [], evidence: 'test', status: 'pending' as const, createdAt: new Date().toISOString() };
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'admin@acds');

    const pending = await repo.findPending();
    expect(pending.length).toBe(0);
  });

  it('each approval has required fields', async () => {
    const { repo } = createApprovalService();
    await seedApprovals(repo);

    const all = await pool.query('SELECT * FROM adaptation_approval_records');
    for (const row of all.rows) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('family_key');
      expect(row).toHaveProperty('recommendation_id');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('submitted_at');
      expect(row).toHaveProperty('expires_at');
    }
  });
});
