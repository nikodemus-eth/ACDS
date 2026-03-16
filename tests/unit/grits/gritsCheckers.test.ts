/**
 * Unit tests for all 7 GRITS integrity checkers.
 *
 * Each checker is constructed with in-memory stub repositories that
 * implement the minimal interface surface the checker actually calls.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Inline type stubs (mirrors the shapes the checkers rely on)
// ---------------------------------------------------------------------------

interface ExecutionFamily {
  application: string;
  process: string;
  step: string;
  decisionPosture: string;
  cognitiveGrade: string;
}

interface ExecutionRecord {
  id: string;
  executionFamily: ExecutionFamily;
  routingDecisionId: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  costEstimate: number | null;
  normalizedOutput: string | null;
  errorMessage: string | null;
  fallbackAttempts: number;
  createdAt: Date;
  completedAt: Date | null;
}

interface FallbackEntry {
  modelProfileId: string;
  tacticProfileId: string;
  providerId: string;
  priority: number;
}

interface RoutingDecision {
  id: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  fallbackChain: FallbackEntry[];
  rationaleId: string;
  rationaleSummary: string;
  resolvedAt: Date;
}

interface Provider {
  id: string;
  name: string;
  vendor: string;
  authType: string;
  baseUrl: string;
  enabled: boolean;
  environment: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AuditEvent {
  id: string;
  eventType: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  application: string | null;
  details: Record<string, unknown>;
  timestamp: Date;
}

interface AdaptationApproval {
  id: string;
  familyKey: string;
  recommendationId: string;
  status: string;
  submittedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  expiresAt: string;
}

interface AdaptationRollbackRecord {
  id: string;
  familyKey: string;
  targetAdaptationEventId: string;
}

interface FamilySelectionState {
  familyKey: string;
  currentCandidateId: string;
  rollingScore: number;
}

interface AdaptationEvent {
  id: string;
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const now = new Date();

function makeExecution(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'exec-1',
    executionFamily: {
      application: 'app-a',
      process: 'proc-1',
      step: 'step-1',
      decisionPosture: 'operational',
      cognitiveGrade: 'standard',
    },
    routingDecisionId: 'rd-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    status: 'succeeded',
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 500,
    costEstimate: 0.01,
    normalizedOutput: null,
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    id: 'rd-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    fallbackChain: [],
    rationaleId: 'rat-1',
    rationaleSummary: 'Best match',
    resolvedAt: now,
    ...overrides,
  };
}

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'prov-1',
    name: 'TestProvider',
    vendor: 'openai',
    authType: 'api_key',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    environment: 'production',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit-1',
    eventType: 'execution',
    actor: 'system',
    action: 'execution_completed',
    resourceType: 'execution',
    resourceId: 'exec-1',
    application: 'app-a',
    details: {},
    timestamp: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stub repositories
// ---------------------------------------------------------------------------

function stubExecutionRepo(executions: ExecutionRecord[]) {
  return {
    findById: async (id: string) => executions.find((e) => e.id === id),
    findByTimeRange: async () => executions,
    findByFamily: async () => executions,
  };
}

function stubRoutingRepo(decisions: Map<string, RoutingDecision>) {
  return {
    findById: async (id: string) => decisions.get(id),
    findByExecutionId: async () => undefined,
  };
}

function stubProviderRepo(
  all: Provider[],
  enabled?: Provider[],
) {
  const eff = enabled ?? all.filter((p) => p.enabled);
  return {
    create: async () => all[0],
    findById: async (id: string) => all.find((p) => p.id === id) ?? null,
    findAll: async () => all,
    findByVendor: async () => all,
    findEnabled: async () => eff,
    update: async () => all[0],
    disable: async () => all[0],
    delete: async () => {},
  };
}

function stubAuditRepo(
  events: AuditEvent[],
  byResourceId?: Map<string, AuditEvent[]>,
) {
  return {
    findByResourceId: async (resourceId: string) =>
      byResourceId?.get(resourceId) ?? events.filter((e) => e.resourceId === resourceId),
    findByTimeRange: async () => events,
    findByEventType: async () => events,
  };
}

function stubOptimizerRepo(
  families: string[],
  familyStates: Map<string, FamilySelectionState>,
) {
  return {
    getFamilyState: async (key: string) => familyStates.get(key),
    saveFamilyState: async () => {},
    getCandidateStates: async () => [],
    saveCandidateState: async () => {},
    listFamilies: async () => families,
  };
}

function stubApprovalRepo(
  byFamily: Map<string, AdaptationApproval[]>,
  pending: AdaptationApproval[] = [],
) {
  return {
    save: async () => {},
    findById: async () => undefined,
    findPending: async () => pending,
    findByFamily: async (key: string) => byFamily.get(key) ?? [],
    updateStatus: async () => {},
  };
}

function stubRollbackRepo(byFamily: Map<string, AdaptationRollbackRecord[]>) {
  return {
    findByFamily: async (key: string) => byFamily.get(key) ?? [],
    findById: async () => undefined,
  };
}

function stubLedger(events: Map<string, AdaptationEvent>) {
  return {
    writeEvent: async () => {},
    listEvents: async () => [],
    getEvent: async (id: string) => events.get(id),
  };
}

function stubPolicyRepo({
  globalPolicy = null as any,
  appPolicies = [] as any[],
} = {}) {
  return {
    getGlobalPolicy: async () => globalPolicy,
    saveGlobalPolicy: async () => globalPolicy,
    getApplicationPolicy: async () => null,
    listApplicationPolicies: async () => appPolicies,
    saveApplicationPolicy: async () => appPolicies[0],
    deleteApplicationPolicy: async () => true,
    findApplicationPolicy: async () => null,
    findApplicationPolicyById: async () => null,
  };
}

// ---------------------------------------------------------------------------
// Dynamic imports — the checkers use package aliases that the test runner
// resolves via the project's tsconfig paths / vitest alias config.
// We import them dynamically so the test file compiles even if aliases
// are only available at runtime.
// ---------------------------------------------------------------------------

// We import the checker classes directly from their source files.
const CHECKER_ROOT = '../../../apps/grits-worker/src/checkers';

// =========================================================================
// ExecutionIntegrityChecker
// =========================================================================

describe('ExecutionIntegrityChecker', async () => {
  const { ExecutionIntegrityChecker } = await import(
    `${CHECKER_ROOT}/ExecutionIntegrityChecker.js`
  );

  it('passes when all executions have routing decisions with rationaleId', async () => {
    const exec = makeExecution();
    const decision = makeDecision();
    const provider = makeProvider();

    const checker = new ExecutionIntegrityChecker(
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map([['rd-1', decision]])),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('fast');
    const inv001 = result.invariants.find((i: any) => i.invariantId === 'INV-001');
    const inv002 = result.invariants.find((i: any) => i.invariantId === 'INV-002');

    expect(inv001.status).toBe('pass');
    expect(inv001.defects).toHaveLength(0);
    expect(inv002.status).toBe('pass');
  });

  it('fails INV-001 when execution has no routing decision', async () => {
    const exec = makeExecution({ routingDecisionId: 'missing-rd' });
    const provider = makeProvider();

    const checker = new ExecutionIntegrityChecker(
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map()),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('fast');
    const inv001 = result.invariants.find((i: any) => i.invariantId === 'INV-001');

    expect(inv001.status).toBe('fail');
    expect(inv001.defects).toHaveLength(1);
    expect(inv001.defects[0].title).toContain('without routing decision');
  });

  it('fails INV-001 when routing decision missing rationaleId', async () => {
    const exec = makeExecution();
    const decision = makeDecision({ rationaleId: '' });
    const provider = makeProvider();

    const checker = new ExecutionIntegrityChecker(
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map([['rd-1', decision]])),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('fast');
    const inv001 = result.invariants.find((i: any) => i.invariantId === 'INV-001');

    expect(inv001.status).toBe('fail');
    expect(inv001.defects).toHaveLength(1);
    expect(inv001.defects[0].title).toContain('missing rationale');
  });

  it('fails INV-002 when fallback chain references disabled provider', async () => {
    const exec = makeExecution({ status: 'fallback_succeeded' });
    const decision = makeDecision({
      fallbackChain: [
        { modelProfileId: 'mp-2', tacticProfileId: 'tp-2', providerId: 'disabled-prov', priority: 1 },
      ],
    });
    const enabledProvider = makeProvider({ id: 'prov-1' });

    const checker = new ExecutionIntegrityChecker(
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map([['rd-1', decision]])),
      stubProviderRepo([enabledProvider]),
    );

    const result = await checker.check('daily');
    const inv002 = result.invariants.find((i: any) => i.invariantId === 'INV-002');

    expect(inv002.status).toBe('fail');
    expect(inv002.defects).toHaveLength(1);
    expect(inv002.defects[0].evidence.fallbackProviderId).toBe('disabled-prov');
  });
});

// =========================================================================
// AdaptiveIntegrityChecker
// =========================================================================

describe('AdaptiveIntegrityChecker', async () => {
  const { AdaptiveIntegrityChecker } = await import(
    `${CHECKER_ROOT}/AdaptiveIntegrityChecker.js`
  );

  it('passes when all families have eligible candidates', async () => {
    const familyStates = new Map<string, FamilySelectionState>([
      ['fam-1', { familyKey: 'fam-1', currentCandidateId: 'model-1:tactic-1:prov-1', rollingScore: 0.8 }],
    ]);
    const provider = makeProvider({ id: 'prov-1' });

    const checker = new AdaptiveIntegrityChecker(
      stubOptimizerRepo(['fam-1'], familyStates),
      stubApprovalRepo(new Map()),
      stubLedger(new Map()),
      stubRollbackRepo(new Map()),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('fast');
    const inv003 = result.invariants.find((i: any) => i.invariantId === 'INV-003');

    expect(inv003.status).toBe('pass');
    expect(inv003.defects).toHaveLength(0);
  });

  it('fails INV-003 when candidate references disabled provider', async () => {
    const familyStates = new Map<string, FamilySelectionState>([
      ['fam-1', { familyKey: 'fam-1', currentCandidateId: 'model-1:tactic-1:disabled-prov', rollingScore: 0.8 }],
    ]);
    const enabledProvider = makeProvider({ id: 'prov-1' });

    const checker = new AdaptiveIntegrityChecker(
      stubOptimizerRepo(['fam-1'], familyStates),
      stubApprovalRepo(new Map()),
      stubLedger(new Map()),
      stubRollbackRepo(new Map()),
      stubProviderRepo([enabledProvider]),
    );

    const result = await checker.check('fast');
    const inv003 = result.invariants.find((i: any) => i.invariantId === 'INV-003');

    expect(inv003.status).toBe('fail');
    expect(inv003.defects).toHaveLength(1);
    expect(inv003.defects[0].title).toContain('disabled provider');
  });

  it('fails INV-004 when approval has invalid state transition', async () => {
    const approval: AdaptationApproval = {
      id: 'appr-1',
      familyKey: 'fam-1',
      recommendationId: 'rec-1',
      status: 'corrupted_state' as any,
      submittedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    const checker = new AdaptiveIntegrityChecker(
      stubOptimizerRepo(['fam-1'], new Map()),
      stubApprovalRepo(new Map([['fam-1', [approval]]])),
      stubLedger(new Map()),
      stubRollbackRepo(new Map()),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('fast');
    const inv004 = result.invariants.find((i: any) => i.invariantId === 'INV-004');

    expect(inv004.status).toBe('fail');
    expect(inv004.defects).toHaveLength(1);
    expect(inv004.defects[0].title).toContain('Invalid approval state');
  });

  it('fails INV-004 when rollback references missing adaptation event', async () => {
    const rollback: AdaptationRollbackRecord = {
      id: 'rb-1',
      familyKey: 'fam-1',
      targetAdaptationEventId: 'missing-event',
    };

    const checker = new AdaptiveIntegrityChecker(
      stubOptimizerRepo(['fam-1'], new Map()),
      stubApprovalRepo(new Map([['fam-1', []]])),
      stubLedger(new Map()), // no events
      stubRollbackRepo(new Map([['fam-1', [rollback]]])),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv004 = result.invariants.find((i: any) => i.invariantId === 'INV-004');

    expect(inv004.status).toBe('fail');
    expect(inv004.defects).toHaveLength(1);
    expect(inv004.defects[0].title).toContain('missing adaptation event');
  });

  it('passes INV-004 when all approvals and rollbacks are valid', async () => {
    const approval: AdaptationApproval = {
      id: 'appr-1',
      familyKey: 'fam-1',
      recommendationId: 'rec-1',
      status: 'approved',
      submittedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };
    const rollback: AdaptationRollbackRecord = {
      id: 'rb-1',
      familyKey: 'fam-1',
      targetAdaptationEventId: 'evt-1',
    };
    const adaptEvent: AdaptationEvent = { id: 'evt-1' };

    const checker = new AdaptiveIntegrityChecker(
      stubOptimizerRepo(['fam-1'], new Map()),
      stubApprovalRepo(new Map([['fam-1', [approval]]])),
      stubLedger(new Map([['evt-1', adaptEvent]])),
      stubRollbackRepo(new Map([['fam-1', [rollback]]])),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv004 = result.invariants.find((i: any) => i.invariantId === 'INV-004');

    expect(inv004.status).toBe('pass');
    expect(inv004.defects).toHaveLength(0);
  });
});

// =========================================================================
// SecurityIntegrityChecker
// =========================================================================

describe('SecurityIntegrityChecker', async () => {
  const { SecurityIntegrityChecker } = await import(
    `${CHECKER_ROOT}/SecurityIntegrityChecker.js`
  );

  it('fails INV-005 when audit event contains API key pattern', async () => {
    const event = makeAuditEvent({
      details: { config: 'sk-abcdefghijklmnopqrstuvwxyz1234' },
    });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([event]),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('fail');
    expect(inv005.defects).toHaveLength(1);
    expect(inv005.defects[0].title).toContain('secret exposure');
  });

  it('passes INV-005 when events have no secrets', async () => {
    const event = makeAuditEvent({
      details: { message: 'All good, no secrets here' },
    });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([event]),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('pass');
    expect(inv005.defects).toHaveLength(0);
  });

  it('fails INV-005 when audit event contains Bearer token', async () => {
    const event = makeAuditEvent({
      details: { header: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def' },
    });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([event]),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('fail');
    expect(inv005.defects.length).toBeGreaterThanOrEqual(1);
  });

  it('fails INV-006 when provider uses http:// scheme', async () => {
    const provider = makeProvider({ baseUrl: 'http://api.insecure.com/v1' });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('daily');
    const inv006 = result.invariants.find((i: any) => i.invariantId === 'INV-006');

    expect(inv006.status).toBe('fail');
    expect(inv006.defects.some((d: any) => d.title.includes('unsafe scheme'))).toBe(true);
  });

  it('fails INV-006 when provider targets localhost', async () => {
    const provider = makeProvider({ baseUrl: 'https://localhost:8080/v1' });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('daily');
    const inv006 = result.invariants.find((i: any) => i.invariantId === 'INV-006');

    expect(inv006.status).toBe('fail');
    expect(inv006.defects.some((d: any) => d.title.includes('unsafe host'))).toBe(true);
  });

  it('passes INV-006 when all providers use https://', async () => {
    const providers = [
      makeProvider({ id: 'p1', baseUrl: 'https://api.openai.com/v1' }),
      makeProvider({ id: 'p2', baseUrl: 'https://api.anthropic.com/v1' }),
    ];

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo(providers),
    );

    const result = await checker.check('daily');
    const inv006 = result.invariants.find((i: any) => i.invariantId === 'INV-006');

    expect(inv006.status).toBe('pass');
    expect(inv006.defects).toHaveLength(0);
  });
});

// =========================================================================
// AuditIntegrityChecker
// =========================================================================

describe('AuditIntegrityChecker', async () => {
  const { AuditIntegrityChecker } = await import(
    `${CHECKER_ROOT}/AuditIntegrityChecker.js`
  );

  it('passes when all executions have audit events', async () => {
    const exec = makeExecution();
    const auditEvent = makeAuditEvent({ resourceId: 'exec-1' });

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([auditEvent]),
      stubExecutionRepo([exec]),
      stubApprovalRepo(new Map(), []),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.status).toBe('pass');
    expect(inv007.defects).toHaveLength(0);
  });

  it('fails when execution missing audit event', async () => {
    const exec = makeExecution({ id: 'exec-orphan' });

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([]), // no events at all
      stubExecutionRepo([exec]),
      stubApprovalRepo(new Map(), []),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.status).toBe('fail');
    expect(inv007.defects).toHaveLength(1);
    expect(inv007.defects[0].title).toContain('missing audit trail');
  });

  it('fails when approval missing submission audit event', async () => {
    const approval: AdaptationApproval = {
      id: 'appr-1',
      familyKey: 'fam-1',
      recommendationId: 'rec-1',
      status: 'pending',
      submittedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    // Audit repo that returns events for the approval but none with action 'approval_submitted'
    const byResourceId = new Map<string, AuditEvent[]>([
      ['appr-1', [makeAuditEvent({ resourceId: 'appr-1', action: 'some_other_action' })]],
    ]);

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([], byResourceId),
      stubExecutionRepo([]),
      stubApprovalRepo(new Map(), [approval]),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.status).toBe('fail');
    expect(inv007.defects).toHaveLength(1);
    expect(inv007.defects[0].title).toContain('Approval missing submission');
  });

  it('passes when approval has a submitted audit event', async () => {
    const approval: AdaptationApproval = {
      id: 'appr-2',
      familyKey: 'fam-2',
      recommendationId: 'rec-2',
      status: 'pending',
      submittedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    const byResourceId = new Map<string, AuditEvent[]>([
      ['appr-2', [makeAuditEvent({ resourceId: 'appr-2', action: 'approval_submitted' })]],
    ]);

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([], byResourceId),
      stubExecutionRepo([]),
      stubApprovalRepo(new Map(), [approval]),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.status).toBe('pass');
  });
});

// =========================================================================
// BoundaryIntegrityChecker
// =========================================================================

describe('BoundaryIntegrityChecker', async () => {
  const { BoundaryIntegrityChecker } = await import(
    `${CHECKER_ROOT}/BoundaryIntegrityChecker.js`
  );

  it('passes when all executions use enabled providers', async () => {
    const exec = makeExecution({ selectedProviderId: 'prov-1' });
    const provider = makeProvider({ id: 'prov-1', enabled: true });

    const checker = new BoundaryIntegrityChecker(
      stubExecutionRepo([exec]),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('pass');
    expect(inv.defects).toHaveLength(0);
  });

  it('fails when execution uses disabled provider', async () => {
    const exec = makeExecution({ selectedProviderId: 'disabled-prov' });
    const enabledProvider = makeProvider({ id: 'prov-1', enabled: true });
    const disabledProvider = makeProvider({ id: 'disabled-prov', enabled: false });

    const checker = new BoundaryIntegrityChecker(
      stubExecutionRepo([exec]),
      stubProviderRepo(
        [enabledProvider, disabledProvider],
        [enabledProvider],
      ),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects).toHaveLength(1);
    expect(inv.defects[0].title).toContain('disabled provider');
  });

  it('reports critical severity when execution uses unknown provider', async () => {
    const exec = makeExecution({ selectedProviderId: 'unknown-prov' });
    const provider = makeProvider({ id: 'prov-1', enabled: true });

    const checker = new BoundaryIntegrityChecker(
      stubExecutionRepo([exec]),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects[0].severity).toBe('critical');
    expect(inv.defects[0].title).toContain('unknown provider');
  });
});

// =========================================================================
// PolicyIntegrityChecker
// =========================================================================

describe('PolicyIntegrityChecker', async () => {
  const { PolicyIntegrityChecker } = await import(
    `${CHECKER_ROOT}/PolicyIntegrityChecker.js`
  );

  it('passes when policies are coherent', async () => {
    const appPolicy = {
      id: 'pol-1',
      application: 'my-app',
      allowedVendors: ['openai'],
      blockedVendors: ['google'],
    };
    const provider = makeProvider({ vendor: 'openai' });

    const checker = new PolicyIntegrityChecker(
      stubPolicyRepo({ appPolicies: [appPolicy] }),
      stubProviderRepo([provider]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('pass');
    expect(inv.defects).toHaveLength(0);
  });

  it('fails when vendor in both allowed and blocked lists', async () => {
    const appPolicy = {
      id: 'pol-conflict',
      application: 'conflicted-app',
      allowedVendors: ['openai', 'anthropic'],
      blockedVendors: ['openai'],
    };

    const checker = new PolicyIntegrityChecker(
      stubPolicyRepo({ appPolicies: [appPolicy] }),
      stubProviderRepo([makeProvider({ vendor: 'openai' })]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    // The overlap defect is medium severity so status should be 'warn'
    expect(inv.defects.length).toBeGreaterThanOrEqual(1);
    expect(inv.defects.some((d: any) => d.title.includes('both allowed and blocked'))).toBe(true);
  });

  it('warns when allowedVendors is empty array', async () => {
    const appPolicy = {
      id: 'pol-empty',
      application: 'empty-app',
      allowedVendors: [],
      blockedVendors: null,
    };

    const checker = new PolicyIntegrityChecker(
      stubPolicyRepo({ appPolicies: [appPolicy] }),
      stubProviderRepo([makeProvider()]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.defects.some((d: any) => d.title.includes('Empty allowedVendors'))).toBe(true);
  });
});

// =========================================================================
// OperationalIntegrityChecker
// =========================================================================

describe('OperationalIntegrityChecker', async () => {
  const { OperationalIntegrityChecker } = await import(
    `${CHECKER_ROOT}/OperationalIntegrityChecker.js`
  );

  it('passes when all decision postures are valid enum values', async () => {
    const exec = makeExecution({
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: 'operational',
        cognitiveGrade: 'standard',
      },
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('pass');
    expect(inv.defects).toHaveLength(0);
  });

  it('fails when execution has invalid posture', async () => {
    const exec = makeExecution({
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: 'hacked_posture',
        cognitiveGrade: 'standard',
      },
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects).toHaveLength(1);
    expect(inv.defects[0].title).toContain('Invalid decision posture');
  });

  it('passes when posture is undefined (not checked)', async () => {
    const exec = makeExecution({
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: undefined as any,
        cognitiveGrade: 'standard',
      },
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    // Falsy posture is skipped by the `if (posture && ...)` guard
    expect(inv.status).toBe('pass');
  });

  it('handles multiple executions with mixed valid and invalid postures', async () => {
    const valid = makeExecution({
      id: 'exec-valid',
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: 'advisory',
        cognitiveGrade: 'standard',
      },
    });
    const invalid = makeExecution({
      id: 'exec-invalid',
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: 'bogus',
        cognitiveGrade: 'standard',
      },
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([valid, invalid]));

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects).toHaveLength(1);
    expect(inv.sampleSize).toBe(2);
  });

  // --- Gap 3 closure: expanded operational checks ---

  it('fails when execution has invalid cognitive grade', async () => {
    const exec = makeExecution({
      executionFamily: {
        application: 'app-a',
        process: 'proc-1',
        step: 'step-1',
        decisionPosture: 'operational',
        cognitiveGrade: 'ultra_mega' as any,
      },
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects.some((d: any) => d.title.includes('Invalid cognitive grade'))).toBe(true);
  });

  it('fails when execution has negative latency', async () => {
    const exec = makeExecution({ latencyMs: -50 });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects.some((d: any) => d.title.includes('Negative latency'))).toBe(true);
  });

  it('flags anomalously high latency', async () => {
    const exec = makeExecution({ latencyMs: 400_000 }); // >300s

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects.some((d: any) => d.title.includes('Anomalously high latency'))).toBe(true);
    expect(inv.defects[0].severity).toBe('medium');
  });

  it('fails when completed execution is missing completedAt', async () => {
    const exec = makeExecution({ status: 'succeeded', completedAt: null });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects.some((d: any) => d.title.includes('missing completedAt'))).toBe(true);
  });

  it('detects stale pending execution', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    const exec = makeExecution({
      status: 'pending',
      createdAt: twoHoursAgo,
      completedAt: null,
    });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.status).toBe('fail');
    expect(inv.defects.some((d: any) => d.title.includes('Stale execution'))).toBe(true);
  });

  it('detects execution gap between consecutive records', async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000);
    const recent = new Date(Date.now() - 100);
    const exec1 = makeExecution({ id: 'exec-old', createdAt: fiveHoursAgo });
    const exec2 = makeExecution({ id: 'exec-new', createdAt: recent });

    const checker = new OperationalIntegrityChecker(stubExecutionRepo([exec1, exec2]));
    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.defects.some((d: any) => d.title.includes('Execution gap'))).toBe(true);
  });
});

// =========================================================================
// Gap 2 closure: BoundaryIntegrityChecker — audit coherence
// =========================================================================

describe('BoundaryIntegrityChecker — audit coherence (Gap 2)', async () => {
  const { BoundaryIntegrityChecker } = await import(
    `${CHECKER_ROOT}/BoundaryIntegrityChecker.js`
  );

  it('detects audit event boundary coherence violation', async () => {
    // An audit event with a routing_* action referencing a 'policy' resource type
    const incoherentEvent = makeAuditEvent({
      id: 'audit-incoherent',
      action: 'routing_override',
      resourceType: 'policy',
    });

    const checker = new BoundaryIntegrityChecker(
      stubExecutionRepo([]),
      stubProviderRepo([makeProvider()]),
      stubAuditRepo([incoherentEvent]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    expect(inv.defects.some((d: any) => d.title.includes('boundary coherence'))).toBe(true);
  });

  it('passes when audit events have coherent action-resource mappings', async () => {
    const coherentEvent = makeAuditEvent({
      id: 'audit-coherent',
      action: 'execution_completed',
      resourceType: 'execution',
    });

    const checker = new BoundaryIntegrityChecker(
      stubExecutionRepo([]),
      stubProviderRepo([makeProvider()]),
      stubAuditRepo([coherentEvent]),
    );

    const result = await checker.check('daily');
    const inv = result.invariants[0];

    // No coherence defects (the event's action prefix "execution" matches resource "execution")
    const coherenceDefects = inv.defects.filter((d: any) => d.title.includes('coherence'));
    expect(coherenceDefects).toHaveLength(0);
  });
});

// =========================================================================
// Gap 4 closure: SecurityIntegrityChecker — expanded secret scanning
// =========================================================================

describe('SecurityIntegrityChecker — expanded scanning (Gap 4)', async () => {
  const { SecurityIntegrityChecker } = await import(
    `${CHECKER_ROOT}/SecurityIntegrityChecker.js`
  );

  it('detects secret in execution errorMessage', async () => {
    const exec = makeExecution({
      errorMessage: 'Failed with key sk-abcdefghijklmnopqrstuvwxyz1234567890',
    });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo([makeProvider()]),
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map()),
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('fail');
    expect(inv005.defects.some((d: any) => d.title.includes('execution errorMessage'))).toBe(true);
  });

  it('detects secret in execution normalizedOutput', async () => {
    const exec = makeExecution({
      normalizedOutput: 'Here is your key: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
    });

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo([makeProvider()]),
      stubExecutionRepo([exec]),
      stubRoutingRepo(new Map()),
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('fail');
    expect(inv005.defects.some((d: any) => d.title.includes('normalizedOutput'))).toBe(true);
  });

  it('detects secret in routing decision rationaleSummary', async () => {
    const exec = makeExecution();
    const decision = makeDecision({
      rationaleSummary: 'Chose provider with api_key="mysecretvalue12345678"',
    });

    const routingRepo = {
      findById: async () => undefined,
      findByExecutionId: async () => decision,
    };

    const checker = new SecurityIntegrityChecker(
      stubAuditRepo([]),
      stubProviderRepo([makeProvider()]),
      stubExecutionRepo([exec]),
      routingRepo,
    );

    const result = await checker.check('daily');
    const inv005 = result.invariants.find((i: any) => i.invariantId === 'INV-005');

    expect(inv005.status).toBe('fail');
    expect(inv005.defects.some((d: any) => d.title.includes('routing rationale'))).toBe(true);
  });
});

// =========================================================================
// Gap 5 closure: AuditIntegrityChecker — deeper verification
// =========================================================================

describe('AuditIntegrityChecker — deeper verification (Gap 5)', async () => {
  const { AuditIntegrityChecker } = await import(
    `${CHECKER_ROOT}/AuditIntegrityChecker.js`
  );

  it('detects audit event with missing actor', async () => {
    const event = makeAuditEvent({
      id: 'audit-no-actor',
      actor: '',
      resourceId: 'something',
    });

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([event]),
      stubExecutionRepo([]),
      stubApprovalRepo(new Map(), []),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.status).toBe('fail');
    expect(inv007.defects.some((d: any) => d.title.includes('missing actor'))).toBe(true);
  });

  it('detects audit event with "unknown" actor', async () => {
    const event = makeAuditEvent({
      id: 'audit-unknown-actor',
      actor: 'unknown',
      resourceId: 'something',
    });

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([event]),
      stubExecutionRepo([]),
      stubApprovalRepo(new Map(), []),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.defects.some((d: any) => d.title.includes('missing actor'))).toBe(true);
  });

  it('detects terminal approval without matching audit event', async () => {
    const approval: AdaptationApproval = {
      id: 'appr-approved',
      familyKey: 'fam-1',
      recommendationId: 'rec-1',
      status: 'approved',
      submittedAt: now.toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    };

    // Has a submission event but no "approved" event
    const byResourceId = new Map<string, AuditEvent[]>([
      ['appr-approved', [makeAuditEvent({
        resourceId: 'appr-approved',
        action: 'approval_submitted',
        actor: 'system',
      })]],
    ]);

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([], byResourceId),
      stubExecutionRepo([]),
      stubApprovalRepo(new Map(), [approval]),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.defects.some((d: any) => d.title.includes('missing approved audit event'))).toBe(true);
  });

  it('detects fallback execution without fallback audit event', async () => {
    const exec = makeExecution({
      id: 'exec-fallback',
      status: 'fallback_succeeded',
    });
    const auditEvent = makeAuditEvent({
      resourceId: 'exec-fallback',
      action: 'execution_completed', // no 'fallback' in action
      actor: 'system',
    });

    const byResourceId = new Map<string, AuditEvent[]>([
      ['exec-fallback', [auditEvent]],
    ]);

    const checker = new AuditIntegrityChecker(
      stubAuditRepo([auditEvent], byResourceId),
      stubExecutionRepo([exec]),
      stubApprovalRepo(new Map(), []),
    );

    const result = await checker.check('daily');
    const inv007 = result.invariants[0];

    expect(inv007.defects.some((d: any) => d.title.includes('Fallback execution'))).toBe(true);
  });
});
