// ---------------------------------------------------------------------------
// Integration Tests -- GRITS Integrity Check Flows (End-to-End)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';

import { runIntegrityChecks } from '../../apps/grits-worker/src/engine/IntegrityEngine.js';
import { analyzeDrift } from '../../apps/grits-worker/src/engine/DriftAnalyzer.js';

import { ExecutionIntegrityChecker } from '../../apps/grits-worker/src/checkers/ExecutionIntegrityChecker.js';
import { AdaptiveIntegrityChecker } from '../../apps/grits-worker/src/checkers/AdaptiveIntegrityChecker.js';
import { SecurityIntegrityChecker } from '../../apps/grits-worker/src/checkers/SecurityIntegrityChecker.js';
import { AuditIntegrityChecker } from '../../apps/grits-worker/src/checkers/AuditIntegrityChecker.js';
import { BoundaryIntegrityChecker } from '../../apps/grits-worker/src/checkers/BoundaryIntegrityChecker.js';
import { PolicyIntegrityChecker } from '../../apps/grits-worker/src/checkers/PolicyIntegrityChecker.js';
import { OperationalIntegrityChecker } from '../../apps/grits-worker/src/checkers/OperationalIntegrityChecker.js';

import { InMemoryExecutionRecordReadRepository } from '../../apps/grits-worker/src/repositories/InMemoryExecutionRecordReadRepository.js';
import { InMemoryRoutingDecisionReadRepository } from '../../apps/grits-worker/src/repositories/InMemoryRoutingDecisionReadRepository.js';
import { InMemoryAuditEventReadRepository } from '../../apps/grits-worker/src/repositories/InMemoryAuditEventReadRepository.js';
import { InMemoryAdaptationRollbackReadRepository } from '../../apps/grits-worker/src/repositories/InMemoryAdaptationRollbackReadRepository.js';
import { InMemoryIntegritySnapshotRepository } from '../../apps/grits-worker/src/repositories/InMemoryIntegritySnapshotRepository.js';

import type { IntegrityChecker } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';
import { DecisionPosture } from '@acds/core-types';
import { CognitiveGrade } from '@acds/core-types';
import { ProviderVendor } from '@acds/core-types';
import { AuthType } from '@acds/core-types';
import { AuditEventType } from '@acds/core-types';

import type { FamilySelectionState } from '@acds/adaptive-optimizer';
import type { AdaptationApproval, AdaptationEvent } from '@acds/adaptive-optimizer';


import type { Provider, RoutingDecision } from '@acds/core-types';
import type { AuditEvent } from '@acds/audit-ledger';
import type { ApplicationPolicy } from '@acds/policy-engine';

// ---------------------------------------------------------------------------
// Helpers -- fresh repository factory functions
// ---------------------------------------------------------------------------

interface TestRepositories {
  execRepo: InMemoryExecutionRecordReadRepository;
  routingRepo: InMemoryRoutingDecisionReadRepository;
  auditRepo: InMemoryAuditEventReadRepository;
  rollbackRepo: InMemoryAdaptationRollbackReadRepository;
  snapshotRepo: InMemoryIntegritySnapshotRepository;
  optimizerRepo: StubOptimizerStateRepository;
  approvalRepo: StubApprovalRepository;
  ledger: StubLedger;
  providerRepo: StubProviderRepository;
  policyRepo: StubPolicyRepository;
}

// Minimal stub implementations for the shared repository interfaces so that
// each test gets isolated state without touching singletons.

class StubOptimizerStateRepository {
  private families = new Map<string, FamilySelectionState>();

  async getFamilyState(familyKey: string) { return this.families.get(familyKey); }
  async saveFamilyState(state: FamilySelectionState) { this.families.set(state.familyKey, state); }
  async getCandidateStates() { return []; }
  async saveCandidateState() {}
  async listFamilies() { return [...this.families.keys()]; }
}

class StubApprovalRepository {
  private approvals: AdaptationApproval[] = [];

  async save(approval: AdaptationApproval) { this.approvals.push(approval); }
  async findById(id: string) { return this.approvals.find((a) => a.id === id); }
  async findPending() { return this.approvals.filter((a) => a.status === 'pending'); }
  async findByFamily(familyKey: string) { return this.approvals.filter((a) => a.familyKey === familyKey); }
  async updateStatus() {}
}

class StubLedger {
  private events: AdaptationEvent[] = [];

  async writeEvent(event: AdaptationEvent) { this.events.push(event); }
  async listEvents(familyKey: string) { return this.events.filter((e) => e.familyKey === familyKey); }
  async getEvent(id: string) { return this.events.find((e) => e.id === id); }
}

class StubProviderRepository {
  private providers: Provider[] = [];

  addProvider(provider: Provider) { this.providers.push(provider); }
  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) {
    const p = { ...input, id: `prov-${this.providers.length + 1}`, createdAt: new Date(), updatedAt: new Date() } as Provider;
    this.providers.push(p);
    return p;
  }
  async findById(id: string) { return this.providers.find((p) => p.id === id) ?? null; }
  async findAll() { return [...this.providers]; }
  async findByVendor(vendor: string) { return this.providers.filter((p) => p.vendor === vendor); }
  async findEnabled() { return this.providers.filter((p) => p.enabled); }
  async update(id: string, input: Partial<Provider>) {
    const p = this.providers.find((x) => x.id === id);
    if (!p) throw new Error('not found');
    Object.assign(p, input);
    return p;
  }
  async disable(id: string) { return this.update(id, { enabled: false }); }
  async delete(id: string) { this.providers = this.providers.filter((p) => p.id !== id); }
}

class StubPolicyRepository {
  private globalPolicy: any = null;
  private appPolicies: ApplicationPolicy[] = [];

  async getGlobalPolicy() { return this.globalPolicy; }
  async saveGlobalPolicy(policy: any) { this.globalPolicy = policy; return policy; }
  async getApplicationPolicy(app: string) { return this.appPolicies.find((p) => p.application === app) ?? null; }
  async listApplicationPolicies() { return [...this.appPolicies]; }
  async saveApplicationPolicy(policy: ApplicationPolicy) { this.appPolicies.push(policy); return policy; }
  async deleteApplicationPolicy() { return true; }
  async getProcessPolicy() { return null; }
  async listProcessPolicies() { return []; }
  async saveProcessPolicy(p: any) { return p; }
  async deleteProcessPolicy() { return true; }
}

// ---------------------------------------------------------------------------
// Seed-data factory helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Partial<Provider> & { id: string; name: string }): Provider {
  return {
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    environment: 'production',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Provider;
}

function makeExecution(overrides: Partial<ExecutionRecord> & { id: string }): ExecutionRecord {
  return {
    executionFamily: {
      application: 'test-app',
      process: 'test-proc',
      step: 'test-step',
      decisionPosture: DecisionPosture.OPERATIONAL,
      cognitiveGrade: CognitiveGrade.STANDARD,
    },
    routingDecisionId: 'rd-1',
    selectedModelProfileId: 'mp-1',
    selectedTacticProfileId: 'tp-1',
    selectedProviderId: 'prov-1',
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
    ...overrides,
  };
}

function makeRoutingDecision(overrides: Partial<RoutingDecision> & { id: string }): RoutingDecision {
  return {
    selectedModelProfileId: 'mp-1',
    selectedTacticProfileId: 'tp-1',
    selectedProviderId: 'prov-1',
    fallbackChain: [],
    rationaleId: 'rat-1',
    rationaleSummary: 'Standard routing',
    resolvedAt: new Date(),
    ...overrides,
  };
}

function makeAuditEvent(overrides: Partial<AuditEvent> & { id: string }): AuditEvent {
  return {
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
}

function freshRepos(): TestRepositories {
  return {
    execRepo: new InMemoryExecutionRecordReadRepository(),
    routingRepo: new InMemoryRoutingDecisionReadRepository(),
    auditRepo: new InMemoryAuditEventReadRepository(),
    rollbackRepo: new InMemoryAdaptationRollbackReadRepository(),
    snapshotRepo: new InMemoryIntegritySnapshotRepository(),
    optimizerRepo: new StubOptimizerStateRepository(),
    approvalRepo: new StubApprovalRepository(),
    ledger: new StubLedger(),
    providerRepo: new StubProviderRepository(),
    policyRepo: new StubPolicyRepository(),
  };
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
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('runs only ExecutionIntegrityChecker + AdaptiveIntegrityChecker for fast cadence', async () => {
    // Seed a valid provider so INV-003 does not fire
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    const checkers = buildFastCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'fast');

    // Fast cadence should only include invariants from the two fast-eligible checkers
    const invariantIds = snapshot.results.map((r) => r.invariantId);
    expect(invariantIds).toContain('INV-001');
    expect(invariantIds).toContain('INV-002');
    expect(invariantIds).toContain('INV-003');
    expect(invariantIds).toContain('INV-004');
    // SecurityIntegrityChecker (INV-005, INV-006) is daily/release only
    expect(invariantIds).not.toContain('INV-005');
    expect(invariantIds).not.toContain('INV-006');
  });

  it('produces a green snapshot when seeded data is clean', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    const rd = makeRoutingDecision({ id: 'rd-1' });
    repos.routingRepo.addDecision(rd, 'exec-1');

    repos.execRepo.addRecord(makeExecution({ id: 'exec-1', routingDecisionId: 'rd-1' }));

    const checkers = buildFastCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'fast');

    expect(snapshot.overallStatus).toBe('green');
    expect(snapshot.defectCount.critical).toBe(0);
    expect(snapshot.defectCount.high).toBe(0);
    expect(snapshot.cadence).toBe('fast');
  });

  it('detects INV-001 violations with seeded bad executions (missing routing decision)', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    // Execution whose routingDecisionId does not resolve to a decision
    repos.execRepo.addRecord(makeExecution({
      id: 'exec-orphan',
      routingDecisionId: 'rd-missing',
    }));

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
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('runs all 7 checkers and produces snapshot with all invariant IDs covered', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    const checkers = buildAllCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    const invariantIds = snapshot.results.map((r) => r.invariantId);
    // All invariant IDs should be present
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
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    // INV-001 violation: execution with no matching routing decision
    repos.execRepo.addRecord(makeExecution({
      id: 'exec-bad',
      routingDecisionId: 'rd-nonexistent',
    }));

    // INV-005 violation: audit event with secret pattern
    repos.auditRepo.addEvent(makeAuditEvent({
      id: 'audit-secret',
      details: { apiKey: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijk' },
    }));

    // INV-006 violation: provider with http:// baseUrl
    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-insecure',
      name: 'Insecure Provider',
      baseUrl: 'http://insecure-api.example.com/v1',
      enabled: true,
    }));

    const checkers = buildAllCheckers(repos);
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    expect(snapshot.overallStatus).toBe('red');

    // Should have high defects (INV-001 missing decision, INV-006 http)
    expect(snapshot.defectCount.high).toBeGreaterThanOrEqual(1);
    // INV-005 secret exposure is critical
    expect(snapshot.defectCount.critical).toBeGreaterThanOrEqual(1);

    // Verify individual invariants are flagged
    const inv001 = snapshot.results.find(
      (r) => r.invariantId === 'INV-001' && r.defects.length > 0,
    );
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
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('runs all checkers and produces DriftReport comparing two snapshots', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    const checkers = buildAllCheckers(repos);

    // First release snapshot -- clean
    const snap1 = await runIntegrityChecks(checkers, 'release');
    await repos.snapshotRepo.save(snap1);

    expect(snap1.overallStatus).toBe('green');
    expect(snap1.cadence).toBe('release');

    // Inject a defect for the second run
    repos.execRepo.addRecord(makeExecution({
      id: 'exec-bad',
      routingDecisionId: 'rd-ghost',
    }));

    // Second release snapshot -- degraded
    const snap2 = await runIntegrityChecks(checkers, 'release');
    await repos.snapshotRepo.save(snap2);

    expect(snap2.overallStatus).toBe('red');

    // Drift analysis
    const drift = analyzeDrift(snap1, snap2);
    expect(drift.previousSnapshotId).toBe(snap1.id);
    expect(drift.currentSnapshotId).toBe(snap2.id);
    expect(drift.drifts.length).toBeGreaterThan(0);

    // At least one invariant should show degradation
    const degraded = drift.drifts.filter((d) => d.direction === 'degraded');
    expect(degraded.length).toBeGreaterThanOrEqual(1);
    expect(drift.netDirection).toBe('degraded');
  });

  it('shows improvement in drift when defects are resolved between snapshots', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    // First snapshot -- with a bad execution (INV-001 fail)
    repos.execRepo.addRecord(makeExecution({
      id: 'exec-problem',
      routingDecisionId: 'rd-missing',
    }));

    // Use only ExecutionIntegrityChecker to avoid INV-001 ID collision
    // with BoundaryIntegrityChecker and PolicyIntegrityChecker in the DriftAnalyzer map
    const execChecker = new ExecutionIntegrityChecker(
      repos.execRepo,
      repos.routingRepo,
      repos.providerRepo,
    );
    const snap1 = await runIntegrityChecks([execChecker], 'release');
    await repos.snapshotRepo.save(snap1);
    expect(snap1.overallStatus).toBe('red');

    // "Fix" by adding the routing decision so the checker can find it
    repos.routingRepo.addDecision(
      makeRoutingDecision({ id: 'rd-missing' }),
      'exec-problem',
    );

    const snap2 = await runIntegrityChecks([execChecker], 'release');
    await repos.snapshotRepo.save(snap2);

    const drift = analyzeDrift(snap1, snap2);

    const improved = drift.drifts.filter((d) => d.direction === 'improved');
    expect(improved.length).toBeGreaterThanOrEqual(1);
    expect(drift.netDirection).toBe('improved');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Security scan', () => {
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('detects INV-005 critical defects when audit events contain secret patterns', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    // Seed audit events with various secret patterns
    repos.auditRepo.addEvent(makeAuditEvent({
      id: 'audit-openai-key',
      details: { token: 'sk-abcdefghijklmnopqrstuvwxyz1234567890' },
    }));

    repos.auditRepo.addEvent(makeAuditEvent({
      id: 'audit-bearer',
      details: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.long_token_value' },
    }));

    repos.auditRepo.addEvent(makeAuditEvent({
      id: 'audit-pem',
      details: { cert: '-----BEGIN RSA PRIVATE KEY-----' },
    }));

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
    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-http-1',
      name: 'HTTP Provider A',
      baseUrl: 'http://api.example.com/v1',
      enabled: true,
    }));

    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-http-2',
      name: 'HTTP Provider B',
      baseUrl: 'http://api.other.com/v1',
      enabled: true,
    }));

    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-safe',
      name: 'Safe Provider',
      baseUrl: 'https://api.safe.com/v1',
      enabled: true,
    }));

    const checker = new SecurityIntegrityChecker(repos.auditRepo, repos.providerRepo as any);
    const snapshot = await runIntegrityChecks([checker], 'daily');

    const inv006 = snapshot.results.find((r) => r.invariantId === 'INV-006');
    expect(inv006).toBeDefined();
    expect(inv006!.status).toBe('fail');
    // Two providers with http:// should yield at least 2 defects
    expect(inv006!.defects.length).toBeGreaterThanOrEqual(2);

    for (const defect of inv006!.defects) {
      expect(defect.severity).toBe('high');
      expect(defect.invariantId).toBe('INV-006');
    }
  });

  it('reports no defects when audit events and providers are clean', async () => {
    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-safe',
      name: 'Safe Provider',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
    }));

    repos.auditRepo.addEvent(makeAuditEvent({
      id: 'audit-clean',
      details: { action: 'Executed task 42', status: 'ok' },
    }));

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
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('engine run with one checker throwing still produces results from other checkers', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    // Create a checker that always throws
    const throwingChecker: IntegrityChecker = {
      name: 'ExplodingChecker',
      invariantIds: ['INV-099' as any],
      supportedCadences: ['fast', 'daily', 'release'],
      check: async () => {
        throw new Error('Kaboom! Simulated checker failure');
      },
    };

    // Combine the throwing checker with a real one
    const realChecker = new ExecutionIntegrityChecker(
      repos.execRepo,
      repos.routingRepo,
      repos.providerRepo as any,
    );

    const checkers: IntegrityChecker[] = [throwingChecker, realChecker];
    const snapshot = await runIntegrityChecks(checkers, 'daily');

    // The engine should not throw -- error isolation
    expect(snapshot).toBeDefined();
    expect(snapshot.cadence).toBe('daily');

    // The throwing checker's invariant should appear as 'skip'
    const skippedResult = snapshot.results.find((r) => (r.invariantId as string) === 'INV-099');
    expect(skippedResult).toBeDefined();
    expect(skippedResult!.status).toBe('skip');
    expect(skippedResult!.summary).toContain('Skipped due to checker error');
    expect(skippedResult!.summary).toContain('Kaboom');

    // The real checker's invariants should still have run
    const inv001 = snapshot.results.find((r) => r.invariantId === 'INV-001');
    expect(inv001).toBeDefined();
    expect(inv001!.status).not.toBe('skip');

    const inv002 = snapshot.results.find((r) => r.invariantId === 'INV-002');
    expect(inv002).toBeDefined();
    expect(inv002!.status).not.toBe('skip');
  });

  it('multiple checkers throwing does not prevent remaining checkers from running', async () => {
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

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

    // Both failed checkers should produce skip results
    const skip090 = snapshot.results.find((r) => (r.invariantId as string) === 'INV-090');
    const skip091 = snapshot.results.find((r) => (r.invariantId as string) === 'INV-091');
    expect(skip090?.status).toBe('skip');
    expect(skip091?.status).toBe('skip');

    // Real checker should still produce a result
    const inv008 = snapshot.results.find((r) => r.invariantId === 'INV-008');
    expect(inv008).toBeDefined();
    expect(inv008!.status).toBe('pass');
  });
});

// ===========================================================================

describe('GRITS Integrity -- Adaptive checker (INV-003 / INV-004)', () => {
  let repos: TestRepositories;

  beforeEach(() => {
    repos = freshRepos();
  });

  it('detects INV-003 when active candidate references a disabled provider', async () => {
    // Only prov-1 is enabled; prov-disabled is not in the enabled set
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));
    repos.providerRepo.addProvider(makeProvider({
      id: 'prov-disabled',
      name: 'Disabled Provider',
      enabled: false,
    }));

    // Family references a candidate whose providerId is disabled
    await repos.optimizerRepo.saveFamilyState({
      familyKey: 'app/proc/step',
      currentCandidateId: 'mp-1:tp-1:prov-disabled',
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
    repos.providerRepo.addProvider(makeProvider({ id: 'prov-1', name: 'OpenAI Prod' }));

    await repos.optimizerRepo.saveFamilyState({
      familyKey: 'app/proc/step',
      currentCandidateId: 'mp-1:tp-1:prov-1',
      rollingScore: 0.9,
      explorationRate: 0.05,
      plateauDetected: false,
      lastAdaptationAt: new Date().toISOString(),
      recentTrend: 'improving',
    });

    // Rollback that references a non-existent adaptation event
    repos.rollbackRepo.addRecord({
      id: 'rb-1',
      familyKey: 'app/proc/step',
      targetAdaptationEventId: 'adapt-event-ghost',
      previousSnapshot: { familyKey: 'app/proc/step', candidateRankings: [], explorationRate: 0.1, capturedAt: new Date().toISOString() } as any,
      restoredSnapshot: { familyKey: 'app/proc/step', candidateRankings: [], explorationRate: 0.05, capturedAt: new Date().toISOString() } as any,
      actor: 'admin',
      reason: 'performance regression',
      rolledBackAt: new Date().toISOString(),
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
