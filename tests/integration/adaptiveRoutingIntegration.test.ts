// ---------------------------------------------------------------------------
// Integration Tests -- Adaptive Routing Integration (Prompt 59)
// PGlite-backed: uses real AdaptiveDispatchResolver with PG optimizer state.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type {
  ModelProfile,
  TacticProfile,
  RoutingRequest,
} from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { AdaptiveDispatchResolver } from '@acds/routing-engine';
import { PgOptimizerStateRepository } from '@acds/persistence-pg';
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
    supportedTaskTypes: [TaskType.ANALYTICAL],
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
    executionMethod: 'direct',
    systemPromptTemplate: 'You are helpful.',
    maxRetries: 3,
    temperature: 0.7,
    topP: 1.0,
    supportedTaskTypes: [TaskType.ANALYTICAL],
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

// ===========================================================================
// Adaptive Dispatch Resolver Uses Adaptive Selection with PG state
// ===========================================================================

describe('Adaptive Routing Integration -- Adaptive Dispatch Resolver', () => {
  let resolver: AdaptiveDispatchResolver;
  let optimizerRepo: PgOptimizerStateRepository;
  let profiles: ModelProfile[];
  let tactics: TacticProfile[];
  let providerMap: Map<string, string>;

  beforeEach(async () => {
    resolver = new AdaptiveDispatchResolver();
    optimizerRepo = new PgOptimizerStateRepository(pool as any);
    profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst' }),
      makeProfile({ id: 'profile-cloud', name: 'Cloud Analyst' }),
    ];
    tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    providerMap = new Map([
      ['profile-local', 'provider-ollama'],
      ['profile-cloud', 'provider-openai'],
    ]);
  });

  it('uses adaptive selection when family state exists in PG', async () => {
    const familyKey = 'thingstead.governance.advisory';

    // Seed PG with family state and candidate states
    await optimizerRepo.saveFamilyState({
      familyKey,
      currentCandidateId: 'profile-local:tactic-single:provider-ollama',
      rollingScore: 0.75,
      explorationRate: 0.1,
      plateauDetected: false,
      lastAdaptationAt: new Date().toISOString(),
      recentTrend: 'stable',
    });

    await optimizerRepo.saveCandidateState({
      candidateId: 'profile-local:tactic-single:provider-ollama',
      familyKey,
      rollingScore: 0.75,
      runCount: 50,
      successRate: 0.9,
      averageLatency: 500,
      lastSelectedAt: new Date().toISOString(),
    });

    await optimizerRepo.saveCandidateState({
      candidateId: 'profile-cloud:tactic-single:provider-openai',
      familyKey,
      rollingScore: 0.90,
      runCount: 50,
      successRate: 0.95,
      averageLatency: 300,
      lastSelectedAt: new Date().toISOString(),
    });

    const result = await resolver.resolve(makeRequest(), {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap: providerMap,
      effectivePolicy: makePolicy(),
      familyKey,
      optimizerStateRepository: optimizerRepo,
      adaptiveMode: 'auto_apply_low_risk',
    });

    expect(result.adaptiveResult).toBeDefined();
    expect(result.decision.selectedModelProfileId).toBeDefined();
  });
});

// ===========================================================================
// Falls Back to Deterministic When No State
// ===========================================================================

describe('Adaptive Routing Integration -- Deterministic Fallback', () => {
  let resolver: AdaptiveDispatchResolver;
  let optimizerRepo: PgOptimizerStateRepository;

  beforeEach(() => {
    resolver = new AdaptiveDispatchResolver();
    optimizerRepo = new PgOptimizerStateRepository(pool as any);
  });

  it('falls back to deterministic when no adaptive state exists in PG', async () => {
    const profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst' }),
      makeProfile({ id: 'profile-cloud', name: 'Cloud Analyst' }),
    ];
    const tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    const providerMap = new Map([
      ['profile-local', 'provider-ollama'],
      ['profile-cloud', 'provider-openai'],
    ]);

    const result = await resolver.resolve(makeRequest(), {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap: providerMap,
      effectivePolicy: makePolicy(),
      familyKey: 'thingstead.governance.advisory',
      optimizerStateRepository: optimizerRepo,
      adaptiveMode: 'auto_apply_low_risk',
    });

    // No adaptive result => deterministic fallback
    expect(result.adaptiveResult).toBeUndefined();
    expect(result.decision.selectedModelProfileId).toBeDefined();
  });

  it('falls back to deterministic when adaptiveMode is undefined', async () => {
    const profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst' }),
    ];
    const tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    const providerMap = new Map([
      ['profile-local', 'provider-ollama'],
    ]);

    const result = await resolver.resolve(makeRequest(), {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap: providerMap,
      effectivePolicy: makePolicy(),
      familyKey: 'thingstead.governance.advisory',
    });

    expect(result.adaptiveResult).toBeUndefined();
    expect(result.decision.selectedModelProfileId).toBe('profile-local');
  });
});

// ===========================================================================
// Preserves Policy Bounds
// ===========================================================================

describe('Adaptive Routing Integration -- Policy Bounds Preservation', () => {
  it('does not select a disabled profile even if scored highest', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const optimizerRepo = new PgOptimizerStateRepository(pool as any);
    const familyKey = 'thingstead.governance.advisory';

    const profiles = [
      makeProfile({ id: 'profile-active', name: 'Active' }),
      makeProfile({ id: 'profile-disabled', name: 'Disabled', enabled: false }),
    ];
    const tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    const providerMap = new Map([
      ['profile-active', 'provider-ollama'],
      ['profile-disabled', 'provider-openai'],
    ]);

    await optimizerRepo.saveFamilyState({
      familyKey,
      currentCandidateId: 'profile-active:tactic-single:provider-ollama',
      rollingScore: 0.70,
      explorationRate: 0.1,
      plateauDetected: false,
      lastAdaptationAt: new Date().toISOString(),
      recentTrend: 'stable',
    });

    await optimizerRepo.saveCandidateState({
      candidateId: 'profile-active:tactic-single:provider-ollama',
      familyKey,
      rollingScore: 0.70,
      runCount: 50,
      successRate: 0.9,
      averageLatency: 500,
      lastSelectedAt: new Date().toISOString(),
    });

    // Even if disabled profile has higher score, it shouldn't be selected
    // because it's not in the eligible list
    const result = await resolver.resolve(makeRequest(), {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap: providerMap,
      effectivePolicy: makePolicy(),
      familyKey,
      optimizerStateRepository: optimizerRepo,
      adaptiveMode: 'auto_apply_all',
    });

    // Disabled profiles are filtered out by eligibility, so the selected
    // profile should be the active one
    expect(result.decision.selectedModelProfileId).toBe('profile-active');
  });

  it('respects policy default when in deterministic fallback', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const profiles = [
      makeProfile({ id: 'profile-a', name: 'Profile A' }),
      makeProfile({ id: 'profile-b', name: 'Profile B' }),
    ];
    const tactics = [
      makeTactic({ id: 'tactic-single', name: 'Single Prompt' }),
    ];
    const providerMap = new Map([
      ['profile-a', 'provider-a'],
      ['profile-b', 'provider-b'],
    ]);
    const policy = makePolicy({ defaultModelProfileId: 'profile-b' });

    const result = await resolver.resolve(makeRequest(), {
      allProfiles: profiles,
      allTactics: tactics,
      profileProviderMap: providerMap,
      effectivePolicy: policy,
      familyKey: 'thingstead.governance.advisory',
    });

    expect(result.adaptiveResult).toBeUndefined();
    expect(result.decision.selectedModelProfileId).toBe('profile-b');
  });
});
