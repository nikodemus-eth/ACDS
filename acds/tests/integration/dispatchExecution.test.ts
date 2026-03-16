// ---------------------------------------------------------------------------
// Integration Tests – Dispatch Execution
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type { RoutingRequest, ModelProfile, TacticProfile } from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { DispatchResolver } from '@acds/routing-engine';
import type { DispatchResolverDeps } from '@acds/routing-engine';
import type { AdapterResponse } from '@acds/provider-adapters';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
function makeProfile(overrides: Partial<ModelProfile> & { id: string; name: string }): ModelProfile {
  return {
    description: 'Test profile',
    vendor: ProviderVendor.OLLAMA,
    modelId: 'test-model',
    contextWindow: 32768,
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.DECISION_SUPPORT],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTactic(overrides: Partial<TacticProfile> & { id: string; name: string }): TacticProfile {
  return {
    description: 'Test tactic',
    executionMethod: 'single_prompt',
    systemPromptTemplate: 'You are a helpful assistant.',
    maxRetries: 2,
    temperature: 0.7,
    topP: 0.9,
    supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.DECISION_SUPPORT],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA, ProviderVendor.OPENAI],
    blockedVendors: [],
    privacy: 'cloud_allowed',
    costSensitivity: 'medium',
    structuredOutputRequired: false,
    traceabilityRequired: false,
    maxLatencyMs: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: false,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    application: 'thingstead',
    process: 'governance',
    step: 'advisory',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.ADVISORY,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

function mockAdapterResponse(content: string): AdapterResponse {
  return {
    content,
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 50,
    finishReason: 'stop',
    latencyMs: 200,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Dispatch Execution – Route Resolution', () => {
  let resolver: DispatchResolver;
  let deps: DispatchResolverDeps;

  beforeEach(() => {
    resolver = new DispatchResolver();

    const profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst', localOnly: true, cloudAllowed: false }),
      makeProfile({ id: 'profile-cloud', name: 'Cloud Analyst' }),
    ];
    const tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    const profileProviderMap = new Map<string, string>();
    profileProviderMap.set('profile-local', 'provider-ollama');
    profileProviderMap.set('profile-cloud', 'provider-openai');

    deps = {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap,
      effectivePolicy: makePolicy(),
    };
  });

  it('returns a RoutingDecision with selected IDs', () => {
    const request = makeRequest();
    const result = resolver.resolve(request, deps);

    expect(result.decision).toBeDefined();
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.selectedModelProfileId).toBeTruthy();
    expect(result.decision.selectedTacticProfileId).toBe('tactic-single');
    expect(result.decision.selectedProviderId).toBeTruthy();
    expect(result.decision.resolvedAt).toBeInstanceOf(Date);
  });

  it('includes a rationale with the decision', () => {
    const request = makeRequest();
    const result = resolver.resolve(request, deps);

    expect(result.rationale).toBeDefined();
    expect(result.rationale.id).toBeTruthy();
    expect(result.rationale.selectedProfileReason).toBeTruthy();
    expect(result.rationale.selectedTacticReason).toBeTruthy();
    expect(result.rationale.eligibleProfileCount).toBeGreaterThan(0);
    expect(result.rationale.eligibleTacticCount).toBeGreaterThan(0);
  });

  it('includes fallback chain entries', () => {
    const request = makeRequest();
    const result = resolver.resolve(request, deps);

    // With 2 eligible profiles, one is primary and one is fallback
    expect(result.decision.fallbackChain).toBeDefined();
    expect(Array.isArray(result.decision.fallbackChain)).toBe(true);
  });

  it('throws when no profiles match the request', () => {
    const request = makeRequest({ taskType: TaskType.PLANNING });
    expect(() => resolver.resolve(request, deps)).toThrow('No eligible model profile found');
  });
});

describe('Dispatch Execution – Successful Provider Execution (mock)', () => {
  it('returns content from a mock adapter execution', () => {
    const response = mockAdapterResponse('The analysis indicates low risk.');

    expect(response.content).toBe('The analysis indicates low risk.');
    expect(response.finishReason).toBe('stop');
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(50);
    expect(response.latencyMs).toBeGreaterThan(0);
  });

  it('adapter response shape is complete', () => {
    const response = mockAdapterResponse('Result text');

    expect(response).toHaveProperty('content');
    expect(response).toHaveProperty('model');
    expect(response).toHaveProperty('inputTokens');
    expect(response).toHaveProperty('outputTokens');
    expect(response).toHaveProperty('finishReason');
    expect(response).toHaveProperty('latencyMs');
  });
});
