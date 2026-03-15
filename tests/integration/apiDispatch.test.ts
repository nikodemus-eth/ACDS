// ---------------------------------------------------------------------------
// Integration Tests – API Dispatch Endpoints (mock-based, no HTTP server)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  RoutingRequest,
  RoutingDecision,
  DispatchRunRequest,
  DispatchRunResponse,
  ExecutionRecord,
  ExecutionRationale,
} from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';
import type { DispatchResult } from '@acds/routing-engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeRoutingRequest(): RoutingRequest {
  return {
    application: 'thingstead',
    process: 'governance',
    step: 'advisory',
    taskType: TaskType.ANALYSIS,
    loadTier: LoadTier.SIMPLE,
    decisionPosture: DecisionPosture.ADVISORY,
    cognitiveGrade: CognitiveGrade.WORKING,
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

function makeRoutingDecision(): RoutingDecision {
  return {
    id: 'decision-001',
    selectedModelProfileId: 'profile-local',
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: 'provider-ollama',
    fallbackChain: [
      {
        modelProfileId: 'profile-cloud',
        tacticProfileId: 'tactic-single',
        providerId: 'provider-openai',
        priority: 1,
      },
    ],
    rationaleId: 'rationale-001',
    rationaleSummary: 'Selected local model for advisory task',
    resolvedAt: new Date(),
  };
}

function makeRationale(): ExecutionRationale {
  return {
    id: 'rationale-001',
    routingDecisionId: 'decision-001',
    executionFamilyKey: 'thingstead.governance.advisory.advisory.working',
    selectedProfileReason: 'Profile Local Analyst selected: supports analysis/simple',
    selectedTacticReason: 'Tactic Single Prompt selected: method single_prompt',
    selectedProviderReason: 'Provider provider-ollama assigned to Local Analyst',
    policyMatchSummary: 'Privacy: cloud_allowed, Cost: medium, Escalation: false',
    eligibleProfileCount: 2,
    eligibleTacticCount: 1,
    constraintsSummary: 'Structured: false, Traceable: false',
    createdAt: new Date(),
  };
}

function makeRunResponse(): DispatchRunResponse {
  return {
    executionId: 'exec-001',
    status: 'succeeded',
    normalizedOutput: 'The advisory analysis is complete.',
    outputFormat: 'text',
    selectedModelProfileId: 'profile-local',
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: 'provider-ollama',
    latencyMs: 220,
    fallbackUsed: false,
    fallbackAttempts: 0,
    rationaleId: 'rationale-001',
    rationaleSummary: 'Selected local model for advisory task',
  };
}

function makeExecutionRecord(id: string): ExecutionRecord {
  return {
    id,
    executionFamily: { key: 'thingstead.governance.advisory', application: 'thingstead', process: 'governance', step: 'advisory' } as any,
    routingDecisionId: 'decision-001',
    selectedModelProfileId: 'profile-local',
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: 'provider-ollama',
    status: 'succeeded',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 220,
    costEstimate: 0.001,
    normalizedOutput: 'Advisory output',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date(),
    completedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Mock controller layer (simulates API behavior without HTTP)
// ---------------------------------------------------------------------------
class MockDispatchAPI {
  private executions: ExecutionRecord[] = [];

  constructor() {
    // Pre-populate some execution records
    this.executions.push(makeExecutionRecord('exec-001'));
    this.executions.push(makeExecutionRecord('exec-002'));
  }

  resolve(_body: RoutingRequest): { status: number; body: DispatchResult } {
    const decision = makeRoutingDecision();
    const rationale = makeRationale();
    return { status: 200, body: { decision, rationale } };
  }

  run(_body: DispatchRunRequest): { status: number; body: DispatchRunResponse } {
    return { status: 200, body: makeRunResponse() };
  }

  listExecutions(): { status: number; body: ExecutionRecord[] } {
    return { status: 200, body: this.executions };
  }

  getExecution(id: string): { status: number; body: ExecutionRecord | { error: string } } {
    const record = this.executions.find((e) => e.id === id);
    if (!record) {
      return { status: 404, body: { error: `Execution record ${id} not found` } };
    }
    return { status: 200, body: record };
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('API – POST /dispatch/resolve', () => {
  let api: MockDispatchAPI;

  beforeEach(() => {
    api = new MockDispatchAPI();
  });

  it('returns a routing decision with selected IDs', () => {
    const response = api.resolve(makeRoutingRequest());

    expect(response.status).toBe(200);
    expect(response.body.decision).toBeDefined();
    expect(response.body.decision.id).toBeTruthy();
    expect(response.body.decision.selectedModelProfileId).toBe('profile-local');
    expect(response.body.decision.selectedTacticProfileId).toBe('tactic-single');
    expect(response.body.decision.selectedProviderId).toBe('provider-ollama');
  });

  it('includes a fallback chain in the decision', () => {
    const response = api.resolve(makeRoutingRequest());

    expect(response.body.decision.fallbackChain).toBeDefined();
    expect(response.body.decision.fallbackChain.length).toBeGreaterThan(0);
    expect(response.body.decision.fallbackChain[0].priority).toBe(1);
  });

  it('includes a rationale with the decision', () => {
    const response = api.resolve(makeRoutingRequest());

    expect(response.body.rationale).toBeDefined();
    expect(response.body.rationale.id).toBeTruthy();
    expect(response.body.rationale.selectedProfileReason).toContain('selected');
    expect(response.body.rationale.eligibleProfileCount).toBeGreaterThan(0);
  });
});

describe('API – POST /dispatch/run', () => {
  let api: MockDispatchAPI;

  beforeEach(() => {
    api = new MockDispatchAPI();
  });

  it('returns an execution result with status succeeded', () => {
    const runRequest: DispatchRunRequest = {
      routingRequest: makeRoutingRequest(),
      inputPayload: 'Analyze this governance scenario.',
      inputFormat: 'text',
    };

    const response = api.run(runRequest);

    expect(response.status).toBe(200);
    expect(response.body.executionId).toBeTruthy();
    expect(response.body.status).toBe('succeeded');
    expect(response.body.normalizedOutput).toBeTruthy();
  });

  it('includes routing metadata in the execution result', () => {
    const runRequest: DispatchRunRequest = {
      routingRequest: makeRoutingRequest(),
      inputPayload: 'Analyze this.',
      inputFormat: 'text',
    };

    const response = api.run(runRequest);

    expect(response.body.selectedModelProfileId).toBe('profile-local');
    expect(response.body.selectedTacticProfileId).toBe('tactic-single');
    expect(response.body.selectedProviderId).toBe('provider-ollama');
    expect(response.body.rationaleId).toBeTruthy();
    expect(response.body.rationaleSummary).toBeTruthy();
  });

  it('reports latency and fallback info', () => {
    const runRequest: DispatchRunRequest = {
      routingRequest: makeRoutingRequest(),
      inputPayload: 'Test input',
      inputFormat: 'text',
    };

    const response = api.run(runRequest);

    expect(response.body.latencyMs).toBeGreaterThan(0);
    expect(response.body.fallbackUsed).toBe(false);
    expect(response.body.fallbackAttempts).toBe(0);
  });
});

describe('API – GET /executions', () => {
  let api: MockDispatchAPI;

  beforeEach(() => {
    api = new MockDispatchAPI();
  });

  it('returns a list of execution records', () => {
    const response = api.listExecutions();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);
  });

  it('each record has the expected shape', () => {
    const response = api.listExecutions();
    const record = response.body[0] as ExecutionRecord;

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('routingDecisionId');
    expect(record).toHaveProperty('selectedModelProfileId');
    expect(record).toHaveProperty('selectedTacticProfileId');
    expect(record).toHaveProperty('selectedProviderId');
    expect(record).toHaveProperty('status');
    expect(record).toHaveProperty('latencyMs');
  });
});

describe('API – GET /executions/:id', () => {
  let api: MockDispatchAPI;

  beforeEach(() => {
    api = new MockDispatchAPI();
  });

  it('returns a single execution record by ID', () => {
    const response = api.getExecution('exec-001');

    expect(response.status).toBe(200);
    const record = response.body as ExecutionRecord;
    expect(record.id).toBe('exec-001');
    expect(record.status).toBe('succeeded');
  });

  it('returns 404 for a non-existent execution', () => {
    const response = api.getExecution('nonexistent-id');

    expect(response.status).toBe(404);
    expect((response.body as { error: string }).error).toContain('not found');
  });
});
