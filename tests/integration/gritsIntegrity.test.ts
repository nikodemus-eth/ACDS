// ---------------------------------------------------------------------------
// Integration Tests -- GRITS Integrity Check Flows (End-to-End)
// PGlite-backed: uses real PG repositories, no Stub/InMemory classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

import { runIntegrityChecks } from '../../apps/grits-worker/src/engine/IntegrityEngine.js';
import { analyzeDrift } from '../../apps/grits-worker/src/engine/DriftAnalyzer.js';

import { ExecutionIntegrityChecker } from '../../apps/grits-worker/src/checkers/ExecutionIntegrityChecker.js';
import { AdaptiveIntegrityChecker } from '../../apps/grits-worker/src/checkers/AdaptiveIntegrityChecker.js';
import { SecurityIntegrityChecker } from '../../apps/grits-worker/src/checkers/SecurityIntegrityChecker.js';
import { AuditIntegrityChecker } from '../../apps/grits-worker/src/checkers/AuditIntegrityChecker.js';
import { BoundaryIntegrityChecker } from '../../apps/grits-worker/src/checkers/BoundaryIntegrityChecker.js';
import { PolicyIntegrityChecker } from '../../apps/grits-worker/src/checkers/PolicyIntegrityChecker.js';
import { OperationalIntegrityChecker } from '../../apps/grits-worker/src/checkers/OperationalIntegrityChecker.js';

import { PgExecutionRecordReadRepository } from '../../apps/grits-worker/src/repositories/PgExecutionRecordReadRepository.js';
import { PgRoutingDecisionReadRepository } from '../../apps/grits-worker/src/repositories/PgRoutingDecisionReadRepository.js';
import { PgAuditEventReadRepository } from '../../apps/grits-worker/src/repositories/PgAuditEventReadRepository.js';
import { PgAdaptationRollbackReadRepository } from '../../apps/grits-worker/src/repositories/PgAdaptationRollbackReadRepository.js';

import {
  PgOptimizerStateRepository,
  PgAdaptationApprovalRepository,
  PgAdaptationEventRepository,
  PgProviderRepository,
  PgPolicyRepository,
} from '@acds/persistence-pg';

import type { IntegrityChecker, IntegritySnapshot } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';
import { DecisionPosture } from '@acds/core-types';
import { CognitiveGrade } from '@acds/core-types';
import { ProviderVendor } from '@acds/core-types';
import { AuthType } from '@acds/core-types';
import { AuditEventType } from '@acds/core-types';

import type { FamilySelectionState } from '@acds/adaptive-optimizer';
import type { Provider, RoutingDecision } from '@acds/core-types';
import type { AuditEvent } from '@acds/audit-ledger';

import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../__test-support__/pglitePool.js';

// -- Deterministic UUID constants for test data (providers.id, execution_records.id,
//    audit_events.id are all UUID columns in the schema) ----------------------

const PROV_1            = '00000000-0000-0000-0000-000000000001';
const PROV_DISABLED     = '00000000-0000-0000-0000-000000000002';
const PROV_INSECURE     = '00000000-0000-0000-0000-000000000003';
const PROV_HTTP_1       = '00000000-0000-0000-0000-000000000004';
const PROV_HTTP_2       = '00000000-0000-0000-0000-000000000005';
const PROV_SAFE         = '00000000-0000-0000-0000-000000000006';

const EXEC_1            = '10000000-0000-0000-0000-000000000001';
const EXEC_ORPHAN       = '10000000-0000-0000-0000-000000000002';
const EXEC_BAD          = '10000000-0000-0000-0000-000000000003';
const EXEC_PROBLEM      = '10000000-0000-0000-0000-000000000004';

const AUDIT_SECRET      = '20000000-0000-0000-0000-000000000001';
const AUDIT_OPENAI_KEY  = '20000000-0000-0000-0000-000000000002';
const AUDIT_BEARER      = '20000000-0000-0000-0000-000000000003';
const AUDIT_PEM         = '20000000-0000-0000-0000-000000000004';
const AUDIT_CLEAN       = '20000000-0000-0000-0000-000000000005';

// Routing decision IDs that intentionally don't match any execution_records.id
// (routing_decision_id is VARCHAR, but PgRoutingDecisionReadRepository.findById
//  queries execution_records.id which is UUID)
const RD_1              = '30000000-0000-0000-0000-000000000001';
const RD_MISSING        = '30000000-0000-0000-0000-0000000000ff';
const RD_NONEXISTENT    = '30000000-0000-0000-0000-0000000000fe';
const RD_GHOST          = '30000000-0000-0000-0000-0000000000fd';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);

  // Add routing_decision JSONB column (used by PgRoutingDecisionReadRepository.mapDecisionFromRow)
  await pool.execSQL(`ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS routing_decision JSONB`);

  // Create integrity_snapshots table (not yet in main migrations)
  await pool.execSQL(`
    CREATE TABLE IF NOT EXISTS integrity_snapshots (
      id TEXT PRIMARY KEY,
      cadence TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      total_duration_ms INTEGER NOT NULL,
      results JSONB NOT NULL,
      overall_status TEXT NOT NULL,
      defect_count JSONB NOT NULL
    )
  `);
});

beforeEach(async () => {
  await truncateAll(pool);
  // Also truncate integrity_snapshots
  await pool.query('TRUNCATE integrity_snapshots CASCADE');
});

afterAll(async () => {
  await closePool();
});

// ---------------------------------------------------------------------------
// Repository factories backed by PGlite
// ---------------------------------------------------------------------------

interface TestRepositories {
  execRepo: PgExecutionRecordReadRepository;
  routingRepo: PgRoutingDecisionReadRepository;
  auditRepo: PgAuditEventReadRepository;
  rollbackRepo: PgAdaptationRollbackReadRepository;
  optimizerRepo: PgOptimizerStateRepository;
  approvalRepo: PgAdaptationApprovalRepository;
  ledger: PgAdaptationEventRepository;
  providerRepo: PgProviderRepository;
  policyRepo: PgPolicyRepository;
}

function freshRepos(): TestRepositories {
  const pgPool = pool as any;
  return {
    execRepo: new PgExecutionRecordReadRepository(pgPool),
    routingRepo: new PgRoutingDecisionReadRepository(pgPool),
    auditRepo: new PgAuditEventReadRepository(pgPool),
    rollbackRepo: new PgAdaptationRollbackReadRepository(pgPool),
    optimizerRepo: new PgOptimizerStateRepository(pgPool),
    approvalRepo: new PgAdaptationApprovalRepository(pgPool),
    ledger: new PgAdaptationEventRepository(pgPool),
    providerRepo: new PgProviderRepository(pgPool),
    policyRepo: new PgPolicyRepository(pgPool),
  };
}

// ---------------------------------------------------------------------------
// Seed-data factory helpers
// ---------------------------------------------------------------------------

async function addProvider(repo: PgProviderRepository, overrides: Partial<Provider> & { id: string; name: string }) {
  const provider = {
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    environment: 'production',
    ...overrides,
  };
  return repo.create(provider);
}

async function addExecution(overrides: Partial<ExecutionRecord> & { id: string } & { routingDecision?: Record<string, unknown> | null }) {
  const rec = {
    application: 'test-app',
    process: 'test-proc',
    step: 'test-step',
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    routingDecisionId: RD_1,
    selectedModelProfileId: 'mp-1',
    selectedTacticProfileId: 'tp-1',
    selectedProviderId: PROV_1,
    status: 'succeeded' as const,
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 350,
    costEstimate: 0.001,
    normalizedOutput: null,
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date(),
    completedAt: new Date(),
    routingDecision: null as Record<string, unknown> | null,
    ...overrides,
  };

  await pool.query(
    `INSERT INTO execution_records
      (id, application, process, step, decision_posture, cognitive_grade,
       routing_decision_id,
       selected_model_profile_id, selected_tactic_profile_id, selected_provider_id,
       status, input_tokens, output_tokens, latency_ms, cost_estimate,
       normalized_output, error_message, fallback_attempts, created_at, completed_at,
       routing_decision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      rec.id, rec.application, rec.process, rec.step, rec.decisionPosture, rec.cognitiveGrade,
      rec.routingDecisionId,
      rec.selectedModelProfileId, rec.selectedTacticProfileId, rec.selectedProviderId,
      rec.status, rec.inputTokens, rec.outputTokens, rec.latencyMs, rec.costEstimate,
      rec.normalizedOutput, rec.errorMessage, rec.fallbackAttempts, rec.createdAt, rec.completedAt,
      rec.routingDecision ? JSON.stringify(rec.routingDecision) : null,
    ],
  );
}

async function addRoutingDecision(executionId: string) {
  // The PgRoutingDecisionReadRepository reads from execution_records, mapping the row
  // So having an execution record IS having a routing decision
  // We just need the execution to exist with the routing_decision_id
}

async function addAuditEvent(overrides: Partial<AuditEvent> & { id: string }) {
  const evt = {
    eventType: AuditEventType.EXECUTION,
    actor: 'system',
    action: 'execution_completed',
    resourceType: 'execution',
    resourceId: 'exec-1',
    application: 'test-app',
    details: {},
    timestamp: new Date(),
    ...overrides,
  };

  await pool.query(
    `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, application, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [evt.id, evt.eventType, evt.actor, evt.action, evt.resourceType, evt.resourceId, evt.application, JSON.stringify(evt.details)],
  );
}

async function addRollbackRecord(overrides: {
  id: string;
  familyKey: string;
  targetAdaptationEventId: string;
  actor: string;
  reason: string;
}) {
  await pool.query(
    `INSERT INTO adaptation_rollback_records
      (id, family_key, snapshot_id, reason, executed_by, executed_at, target_adaptation_event_id, previous_snapshot, restored_snapshot)
     VALUES ($1, $2, $3, $4, $5, NOW(), $3, '{}', '{}')`,
    [overrides.id, overrides.familyKey, overrides.targetAdaptationEventId, overrides.reason, overrides.actor],
  );
}

// ---------------------------------------------------------------------------
// Build checker arrays from fresh repos
// ---------------------------------------------------------------------------

function buildFastCheckers(r: TestRepositories): IntegrityChecker[] {
  return [
    new ExecutionIntegrityChecker(r.execRepo, r.routingRepo, r.providerRepo as any),
    new AdaptiveIntegrityChecker(r.optimizerRepo as any, r.approvalRepo as any, r.ledger as any, r.rollbackRepo, r.providerRepo as any),
  ];
}

function buildAllCheckers(r: TestRepositories): IntegrityChecker[] {
  return [
    new ExecutionIntegrityChecker(r.execRepo, r.routingRepo, r.providerRepo as any),
    new AdaptiveIntegrityChecker(r.optimizerRepo as any, r.approvalRepo as any, r.ledger as any, r.rollbackRepo, r.providerRepo as any),
    new SecurityIntegrityChecker(r.auditRepo, r.providerRepo as any),
    new AuditIntegrityChecker(r.auditRepo, r.execRepo, r.approvalRepo as any),
    new BoundaryIntegrityChecker(r.execRepo, r.providerRepo as any),
    new PolicyIntegrityChecker(r.policyRepo as any, r.providerRepo as any),
    new OperationalIntegrityChecker(r.execRepo),
  ];
}

// ===========================================================================
// TEST SUITES
// ===========================================================================

describe('GRITS Integrity -- Fast cadence integration', () => {
  it('runs only ExecutionIntegrityChecker + AdaptiveIntegrityChecker for fast cadence', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    const checkers = buildFastCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'fast');

    const invariantIds = snapshot.results.map((r) => r.invariantId);
    expect(invariantIds).toContain('INV-001');
    expect(invariantIds).toContain('INV-002');
    expect(invariantIds).toContain('INV-003');
    expect(invariantIds).toContain('INV-004');
    expect(invariantIds).not.toContain('INV-005');
    expect(invariantIds).not.toContain('INV-006');
  });

  it('produces a green snapshot when seeded data is clean', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    await addExecution({
      id: EXEC_1,
      routingDecisionId: EXEC_1,
      routingDecision: {
        id: EXEC_1,
        selectedModelProfileId: 'mp-1',
        selectedTacticProfileId: 'tp-1',
        selectedProviderId: PROV_1,
        fallbackChain: [],
        rationaleId: 'rationale-1',
        rationaleSummary: 'test rationale',
        resolvedAt: new Date().toISOString(),
      },
    });

    const checkers = buildFastCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'fast');

    expect(snapshot.overallStatus).toBe('green');
    expect(snapshot.defectCount.critical).toBe(0);
    expect(snapshot.defectCount.high).toBe(0);
    expect(snapshot.cadence).toBe('fast');
  });

  it('detects INV-001 violations with seeded bad executions (missing routing decision)', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    // Execution whose routingDecisionId does not resolve to a decision
    await addExecution({ id: EXEC_ORPHAN, routingDecisionId: RD_MISSING });

    const checkers = buildFastCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'fast');

    expect(snapshot.overallStatus).toBe('red');
    const inv001 = snapshot.results.find((r) => r.invariantId === 'INV-001');
    expect(inv001).toBeDefined();
    expect(inv001!.status).toBe('fail');
    expect(inv001!.defects.length).toBeGreaterThanOrEqual(1);
    expect(inv001!.defects[0].severity).toBe('high');
    expect(inv001!.defects[0].title).toContain('without routing decision');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Daily cadence integration', () => {
  it('runs all 7 checkers and produces snapshot with all invariant IDs covered', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    const checkers = buildAllCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    const invariantIds = snapshot.results.map((r) => r.invariantId);
    expect(invariantIds).toContain('INV-001');
    expect(invariantIds).toContain('INV-002');
    expect(invariantIds).toContain('INV-003');
    expect(invariantIds).toContain('INV-004');
    expect(invariantIds).toContain('INV-005');
    expect(invariantIds).toContain('INV-006');
    expect(invariantIds).toContain('INV-007');
    expect(invariantIds).toContain('INV-008');
  });

  it('detects mixed severity defects across multiple checkers', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    // INV-001 violation: execution with no matching routing decision
    await addExecution({ id: EXEC_BAD, routingDecisionId: RD_NONEXISTENT });

    // INV-005 violation: audit event with secret pattern
    await addAuditEvent({
      id: AUDIT_SECRET,
      details: { apiKey: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijk' },
    });

    // INV-006 violation: provider with http:// baseUrl
    await addProvider(repos.providerRepo, {
      id: PROV_INSECURE,
      name: 'Insecure Provider',
      baseUrl: 'http://insecure-api.example.com/v1',
      enabled: true,
    });

    const checkers = buildAllCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    expect(snapshot.overallStatus).toBe('red');
    expect(snapshot.defectCount.high).toBeGreaterThanOrEqual(1);
    expect(snapshot.defectCount.critical).toBeGreaterThanOrEqual(1);

    const inv001 = snapshot.results.find((r) => r.invariantId === 'INV-001' && r.defects.length > 0);
    expect(inv001).toBeDefined();

    const inv005 = snapshot.results.find((r) => r.invariantId === 'INV-005');
    expect(inv005).toBeDefined();
    expect(inv005!.status).toBe('fail');

    const inv006 = snapshot.results.find((r) => r.invariantId === 'INV-006');
    expect(inv006).toBeDefined();
    expect(inv006!.status).toBe('fail');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Release cadence + drift', () => {
  it('runs all checkers and produces DriftReport comparing two snapshots', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    const checkers = buildAllCheckers(repos);

    // First release snapshot -- clean
    const snap1 = await runIntegrityChecks(checkers, 'release');
    expect(snap1.overallStatus).toBe('green');
    expect(snap1.cadence).toBe('release');

    // Inject a defect for the second run
    await addExecution({ id: EXEC_BAD, routingDecisionId: RD_GHOST });

    // Second release snapshot -- degraded
    const snap2 = await runIntegrityChecks(checkers, 'release');
    expect(snap2.overallStatus).toBe('red');

    // Drift analysis
    const drift = analyzeDrift(snap1, snap2);
    expect(drift.previousSnapshotId).toBe(snap1.id);
    expect(drift.currentSnapshotId).toBe(snap2.id);
    expect(drift.drifts.length).toBeGreaterThan(0);

    const degraded = drift.drifts.filter((d) => d.direction === 'degraded');
    expect(degraded.length).toBeGreaterThanOrEqual(1);
    expect(drift.netDirection).toBe('degraded');
  });

  it('shows improvement in drift when defects are resolved between snapshots', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    // First snapshot -- with a bad execution (INV-001 fail)
    await addExecution({ id: EXEC_PROBLEM, routingDecisionId: RD_MISSING });

    const execChecker = new ExecutionIntegrityChecker(
      repos.execRepo,
      repos.routingRepo,
      repos.providerRepo,
    );
    const snap1 = await runIntegrityChecks([execChecker], 'release');
    expect(snap1.overallStatus).toBe('red');

    // "Fix" by updating exec-problem to have a valid routing_decision_id that maps to itself,
    // and a routing_decision JSONB blob with a non-empty rationaleId.
    await pool.query(
      `UPDATE execution_records SET routing_decision_id = $1, routing_decision = $3 WHERE id = $2`,
      [EXEC_PROBLEM, EXEC_PROBLEM, JSON.stringify({
        id: EXEC_PROBLEM,
        selectedModelProfileId: 'mp-1',
        selectedTacticProfileId: 'tp-1',
        selectedProviderId: PROV_1,
        fallbackChain: [],
        rationaleId: 'rationale-fix',
        rationaleSummary: 'fixed rationale',
        resolvedAt: new Date().toISOString(),
      })],
    );

    const snap2 = await runIntegrityChecks([execChecker], 'release');

    const drift = analyzeDrift(snap1, snap2);

    const improved = drift.drifts.filter((d) => d.direction === 'improved');
    expect(improved.length).toBeGreaterThanOrEqual(1);
    expect(drift.netDirection).toBe('improved');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Security scan', () => {
  it('detects INV-005 critical defects when audit events contain secret patterns', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    await addAuditEvent({
      id: AUDIT_OPENAI_KEY,
      details: { token: 'sk-abcdefghijklmnopqrstuvwxyz1234567890' },
    });

    await addAuditEvent({
      id: AUDIT_BEARER,
      details: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.long_token_value' },
    });

    await addAuditEvent({
      id: AUDIT_PEM,
      details: { cert: '-----BEGIN RSA PRIVATE KEY-----' },
    });

    const checker = new SecurityIntegrityChecker(repos.auditRepo, repos.providerRepo as any);
    const snapshot = await runIntegrityChecks([checker], 'daily');

    const inv005 = snapshot.results.find((r) => r.invariantId === 'INV-005');
    expect(inv005).toBeDefined();
    expect(inv005!.status).toBe('fail');
    expect(inv005!.defects.length).toBe(3);

    for (const defect of inv005!.defects) {
      expect(defect.severity).toBe('critical');
      expect(defect.invariantId).toBe('INV-005');
    }
  });

  it('detects INV-006 high defects when providers use http:// endpoints', async () => {
    const repos = freshRepos();

    await addProvider(repos.providerRepo, {
      id: PROV_HTTP_1,
      name: 'HTTP Provider A',
      baseUrl: 'http://api.example.com/v1',
      enabled: true,
    });

    await addProvider(repos.providerRepo, {
      id: PROV_HTTP_2,
      name: 'HTTP Provider B',
      baseUrl: 'http://api.other.com/v1',
      enabled: true,
    });

    await addProvider(repos.providerRepo, {
      id: PROV_SAFE,
      name: 'Safe Provider',
      baseUrl: 'https://api.safe.com/v1',
      enabled: true,
    });

    const checker = new SecurityIntegrityChecker(repos.auditRepo, repos.providerRepo as any);
    const snapshot = await runIntegrityChecks([checker], 'daily');

    const inv006 = snapshot.results.find((r) => r.invariantId === 'INV-006');
    expect(inv006).toBeDefined();
    expect(inv006!.status).toBe('fail');
    expect(inv006!.defects.length).toBeGreaterThanOrEqual(2);

    for (const defect of inv006!.defects) {
      expect(defect.severity).toBe('high');
      expect(defect.invariantId).toBe('INV-006');
    }
  });

  it('reports no defects when audit events and providers are clean', async () => {
    const repos = freshRepos();

    await addProvider(repos.providerRepo, {
      id: PROV_SAFE,
      name: 'Safe Provider',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
    });

    await addAuditEvent({
      id: AUDIT_CLEAN,
      details: { action: 'Executed task 42', status: 'ok' },
    });

    const checker = new SecurityIntegrityChecker(repos.auditRepo, repos.providerRepo as any);
    const snapshot = await runIntegrityChecks([checker], 'daily');

    const inv005 = snapshot.results.find((r) => r.invariantId === 'INV-005');
    expect(inv005!.status).toBe('pass');
    expect(inv005!.defects.length).toBe(0);

    const inv006 = snapshot.results.find((r) => r.invariantId === 'INV-006');
    expect(inv006!.status).toBe('pass');
    expect(inv006!.defects.length).toBe(0);

    expect(snapshot.overallStatus).toBe('green');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Error isolation', () => {
  it('engine run with one checker throwing still produces results from other checkers', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    const throwingChecker: IntegrityChecker = {
      name: 'ExplodingChecker',
      invariantIds: ['INV-099' as any],
      supportedCadences: ['fast', 'daily', 'release'],
      check: async () => {
        throw new Error('Kaboom! Simulated checker failure');
      },
    };

    const realChecker = new ExecutionIntegrityChecker(
      repos.execRepo,
      repos.routingRepo,
      repos.providerRepo as any,
    );

    const checkers: IntegrityChecker[] = [throwingChecker, realChecker];
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    expect(snapshot).toBeDefined();
    expect(snapshot.cadence).toBe('daily');

    const skippedResult = snapshot.results.find((r) => (r.invariantId as string) === 'INV-099');
    expect(skippedResult).toBeDefined();
    expect(skippedResult!.status).toBe('skip');
    expect(skippedResult!.summary).toContain('Skipped due to checker error');
    expect(skippedResult!.summary).toContain('Kaboom');

    const inv001 = snapshot.results.find((r) => r.invariantId === 'INV-001');
    expect(inv001).toBeDefined();
    expect(inv001!.status).not.toBe('skip');

    const inv002 = snapshot.results.find((r) => r.invariantId === 'INV-002');
    expect(inv002).toBeDefined();
    expect(inv002!.status).not.toBe('skip');
  });

  it('multiple checkers throwing does not prevent remaining checkers from running', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    const thrower1: IntegrityChecker = {
      name: 'Thrower1',
      invariantIds: ['INV-090' as any],
      supportedCadences: ['daily'],
      check: async () => { throw new Error('Failure A'); },
    };

    const thrower2: IntegrityChecker = {
      name: 'Thrower2',
      invariantIds: ['INV-091' as any],
      supportedCadences: ['daily'],
      check: async () => { throw new Error('Failure B'); },
    };

    const realChecker = new OperationalIntegrityChecker(repos.execRepo);

    const snapshot = await runIntegrityChecks([thrower1, thrower2, realChecker], 'daily');

    const skip090 = snapshot.results.find((r) => (r.invariantId as string) === 'INV-090');
    const skip091 = snapshot.results.find((r) => (r.invariantId as string) === 'INV-091');
    expect(skip090?.status).toBe('skip');
    expect(skip091?.status).toBe('skip');

    const inv008 = snapshot.results.find((r) => r.invariantId === 'INV-008');
    expect(inv008).toBeDefined();
    expect(inv008!.status).toBe('pass');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Adaptive checker (INV-003 / INV-004)', () => {
  it('detects INV-003 when active candidate references a disabled provider', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });
    const disabled = await addProvider(repos.providerRepo, {
      id: PROV_DISABLED,
      name: 'Disabled Provider',
      enabled: true, // create as enabled, then disable
    });
    await repos.providerRepo.disable(disabled.id);

    await repos.optimizerRepo.saveFamilyState({
      familyKey: 'app/proc/step',
      currentCandidateId: `mp-1:tp-1:${PROV_DISABLED}`,
      rollingScore: 0.8,
      explorationRate: 0.1,
      plateauDetected: false,
      lastAdaptationAt: new Date().toISOString(),
      recentTrend: 'stable',
    });

    const checker = new AdaptiveIntegrityChecker(
      repos.optimizerRepo as any,
      repos.approvalRepo as any,
      repos.ledger as any,
      repos.rollbackRepo,
      repos.providerRepo as any,
    );

    const snapshot = await runIntegrityChecks([checker], 'fast');

    const inv003 = snapshot.results.find((r) => r.invariantId === 'INV-003');
    expect(inv003).toBeDefined();
    expect(inv003!.status).toBe('fail');
    expect(inv003!.defects.length).toBe(1);
    expect(inv003!.defects[0].severity).toBe('critical');
    expect(inv003!.defects[0].title).toContain('disabled provider');
  });

  it('detects INV-004 when rollback references missing adaptation event', async () => {
    const repos = freshRepos();
    await addProvider(repos.providerRepo, { id: PROV_1, name: 'OpenAI Prod' });

    await repos.optimizerRepo.saveFamilyState({
      familyKey: 'app/proc/step',
      currentCandidateId: `mp-1:tp-1:${PROV_1}`,
      rollingScore: 0.9,
      explorationRate: 0.05,
      plateauDetected: false,
      lastAdaptationAt: new Date().toISOString(),
      recentTrend: 'improving',
    });

    // Rollback that references a non-existent adaptation event
    await addRollbackRecord({
      id: 'rb-1',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'adapt-event-ghost',
      actor: 'admin',
      reason: 'performance regression',
    });

    const checker = new AdaptiveIntegrityChecker(
      repos.optimizerRepo as any,
      repos.approvalRepo as any,
      repos.ledger as any,
      repos.rollbackRepo,
      repos.providerRepo as any,
    );

    const snapshot = await runIntegrityChecks([checker], 'fast');

    const inv004 = snapshot.results.find((r) => r.invariantId === 'INV-004');
    expect(inv004).toBeDefined();
    expect(inv004!.status).toBe('fail');
    expect(inv004!.defects.length).toBe(1);
    expect(inv004!.defects[0].title).toContain('Rollback references missing adaptation event');
  });
});
