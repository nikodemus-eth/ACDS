// ---------------------------------------------------------------------------
// Shared PGlite-backed repository factory for tests.
//
// Every test that needs a repository should use this instead of InMemory fakes.
// PGlite is a real PostgreSQL engine running in-process — not a mock.
// ---------------------------------------------------------------------------

import { createTestPool, runMigrations, type PoolLike } from './pglitePool.js';
import {
  PgProviderRepository,
  PgProviderHealthRepository,
  PgExecutionRecordRepository,
  PgOptimizerStateRepository,
  PgAdaptationApprovalRepository,
  PgPolicyRepository,
  PgAuditEventRepository,
  PgFamilyPerformanceRepository,
  PgAdaptationEventRepository,
  PgAdaptationRecommendationRepository,
  PgSecretCipherStore,
  PgRollbackRecordWriter,
  PgApprovalAuditEmitter,
  PgRollbackAuditEmitter,
} from '@acds/persistence-pg';

export interface TestRepositories {
  pool: PoolLike;
  providerRepository: PgProviderRepository;
  providerHealthRepository: PgProviderHealthRepository;
  executionRecordRepository: PgExecutionRecordRepository;
  optimizerStateRepository: PgOptimizerStateRepository;
  adaptationApprovalRepository: PgAdaptationApprovalRepository;
  policyRepository: PgPolicyRepository;
  auditEventRepository: PgAuditEventRepository;
  familyPerformanceRepository: PgFamilyPerformanceRepository;
  adaptationEventRepository: PgAdaptationEventRepository;
  adaptationRecommendationRepository: PgAdaptationRecommendationRepository;
  secretCipherStore: PgSecretCipherStore;
  rollbackRecordWriter: PgRollbackRecordWriter;
  approvalAuditEmitter: PgApprovalAuditEmitter;
  rollbackAuditEmitter: PgRollbackAuditEmitter;
}

/**
 * Creates all PG repositories backed by an in-process PGlite database.
 * Runs all migrations before returning.
 *
 * Usage:
 *   let repos: TestRepositories;
 *   beforeAll(async () => { repos = await createTestRepositories(); });
 *   afterAll(async () => { await repos.pool.end(); });
 */
export async function createTestRepositories(): Promise<TestRepositories> {
  const pool = await createTestPool();
  await runMigrations(pool);

  // PGlite's PoolLike is query-compatible with pg.Pool.
  // Cast to satisfy TypeScript's nominal typing on pg.Pool.
  const pgPool = pool as any;

  return {
    pool,
    providerRepository: new PgProviderRepository(pgPool),
    providerHealthRepository: new PgProviderHealthRepository(pgPool),
    executionRecordRepository: new PgExecutionRecordRepository(pgPool),
    optimizerStateRepository: new PgOptimizerStateRepository(pgPool),
    adaptationApprovalRepository: new PgAdaptationApprovalRepository(pgPool),
    policyRepository: new PgPolicyRepository(pgPool),
    auditEventRepository: new PgAuditEventRepository(pgPool),
    familyPerformanceRepository: new PgFamilyPerformanceRepository(pgPool),
    adaptationEventRepository: new PgAdaptationEventRepository(pgPool),
    adaptationRecommendationRepository: new PgAdaptationRecommendationRepository(pgPool),
    secretCipherStore: new PgSecretCipherStore(pgPool),
    rollbackRecordWriter: new PgRollbackRecordWriter(pgPool),
    approvalAuditEmitter: new PgApprovalAuditEmitter(pgPool),
    rollbackAuditEmitter: new PgRollbackAuditEmitter(pgPool),
  };
}
