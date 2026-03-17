import { describe, it, expect } from 'vitest';
import { AdaptiveDispatchResolver } from './AdaptiveDispatchResolver.js';
import type { AdaptiveDispatchResolverDeps } from './AdaptiveDispatchResolver.js';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';

const now = new Date('2026-03-15T10:00:00Z');

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    application: 'TestApp',
    process: 'Review',
    step: 'Analyze',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed' as const,
      maxLatencyMs: null,
      costSensitivity: 'medium' as const,
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

function makeProfile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `profile_${id}`,
    description: 'test profile',
    vendor: 'openai',
    modelId: `model_${id}`,
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    minimumCognitiveGrade: CognitiveGrade.STANDARD,
    contextWindow: 8192,
    maxTokens: 2048,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTactic(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `tactic_${id}`,
    description: 'test tactic',
    executionMethod: 'single_pass',
    systemPromptTemplate: '',
    outputSchema: undefined,
    maxRetries: 0,
    temperature: 0,
    topP: 1,
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEffectivePolicy(overrides: Record<string, unknown> = {}) {
  return {
    allowedVendors: [],
    blockedVendors: [],
    privacy: 'cloud_allowed' as const,
    costSensitivity: 'medium' as const,
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

function makeDeps(overrides: Partial<AdaptiveDispatchResolverDeps> = {}): AdaptiveDispatchResolverDeps {
  return {
    allProfiles: [makeProfile('prof-1')],
    allTactics: [makeTactic('tac-1')],
    profileProviderMap: new Map([['prof-1', 'prov-1']]),
    effectivePolicy: makeEffectivePolicy(),
    familyKey: 'testapp:review:analyze',
    ...overrides,
  };
}

// In-memory optimizer state repository
class InMemoryOptimizerStateRepo {
  private familyStates = new Map<string, any>();
  private candidateStates = new Map<string, any[]>();

  setFamilyState(state: any) {
    this.familyStates.set(state.familyKey, state);
  }

  setCandidateStates(familyKey: string, states: any[]) {
    this.candidateStates.set(familyKey, states);
  }

  async getFamilyState(familyKey: string) {
    return this.familyStates.get(familyKey);
  }

  async saveFamilyState(state: any) {
    this.familyStates.set(state.familyKey, state);
  }

  async getCandidateStates(familyKey: string) {
    return this.candidateStates.get(familyKey) ?? [];
  }

  async saveCandidateState(state: any) {
    const key = state.familyKey;
    const existing = this.candidateStates.get(key) ?? [];
    existing.push(state);
    this.candidateStates.set(key, existing);
  }

  async listFamilies() {
    return Array.from(this.familyStates.keys());
  }
}

describe('AdaptiveDispatchResolver', () => {
  it('resolves deterministically when no adaptive mode is set', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps();

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.decision.selectedModelProfileId).toBe('prof-1');
    expect(result.decision.selectedTacticProfileId).toBe('tac-1');
    expect(result.decision.selectedProviderId).toBe('prov-1');
    expect(result.rationale).toBeDefined();
    expect(result.adaptiveResult).toBeUndefined();
  });

  it('throws on invalid routing request', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps();

    await expect(
      resolver.resolve({ application: '' } as any, deps),
    ).rejects.toThrow('Invalid routing request');
  });

  it('throws when no eligible profiles exist', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps({ allProfiles: [] });

    await expect(
      resolver.resolve(makeRequest(), deps),
    ).rejects.toThrow('No eligible model profile found');
  });

  it('throws when no eligible tactics exist', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps({ allTactics: [] });

    await expect(
      resolver.resolve(makeRequest(), deps),
    ).rejects.toThrow('No eligible tactic profile found');
  });

  it('throws when no provider is mapped for selected profile', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps({ profileProviderMap: new Map() });

    await expect(
      resolver.resolve(makeRequest(), deps),
    ).rejects.toThrow('No provider mapped for profile');
  });

  it('falls back to deterministic when adaptive mode is set but no optimizer state repo', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps({ adaptiveMode: 'fully_applied' });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.adaptiveResult).toBeUndefined();
  });

  it('falls back to deterministic when optimizer repo has no family state', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const deps = makeDeps({
      adaptiveMode: 'fully_applied',
      optimizerStateRepository: repo,
    });

    const originalLog = console.log;
    const captured: unknown[] = [];
    console.log = (...args: unknown[]) => captured.push(args);

    try {
      const result = await resolver.resolve(makeRequest(), deps);

      expect(result.decision).toBeDefined();
      expect(result.adaptiveResult).toBeUndefined();
      // Should log fallback message
      expect(captured.length).toBeGreaterThanOrEqual(1);
      const logMsg = (captured[0] as unknown[])[0] as string;
      expect(logMsg).toContain('[adaptive-dispatch]');
      expect(logMsg).toContain('falling back to deterministic');
    } finally {
      console.log = originalLog;
    }
  });

  it('uses adaptive selection when optimizer state exists', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'prof-1:tac-1:prov-1',
      rollingScore: 0.8,
      explorationRate: 0.0, // no exploration to get deterministic result
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    repo.setCandidateStates(familyKey, [
      {
        candidateId: 'prof-1:tac-1:prov-1',
        familyKey,
        rollingScore: 0.8,
        runCount: 100,
        successRate: 0.95,
        averageLatency: 200,
        lastSelectedAt: now.toISOString(),
      },
    ]);

    const deps = makeDeps({
      adaptiveMode: 'fully_applied',
      optimizerStateRepository: repo,
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.adaptiveResult).toBeDefined();
    expect(result.decision.selectedModelProfileId).toBe('prof-1');
    expect(result.decision.selectedProviderId).toBe('prov-1');
    expect(result.rationale.routingDecisionId).toBe(result.decision.id);
  });

  it('builds fallback chain from remaining eligible profiles in deterministic mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps({
      allProfiles: [makeProfile('prof-1'), makeProfile('prof-2')],
      profileProviderMap: new Map([['prof-1', 'prov-1'], ['prof-2', 'prov-2']]),
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision.fallbackChain.length).toBeGreaterThanOrEqual(1);
  });

  it('rationale contains the execution family key', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps();

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.rationale.executionFamilyKey).toContain('testapp');
    expect(result.rationale.executionFamilyKey).toContain('review');
    expect(result.rationale.executionFamilyKey).toContain('analyze');
  });

  it('decision rationaleSummary contains [deterministic] in deterministic mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const deps = makeDeps();

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision.rationaleSummary).toContain('[deterministic]');
  });

  it('decision rationaleSummary contains [adaptive] in adaptive mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'prof-1:tac-1:prov-1',
      rollingScore: 0.8,
      explorationRate: 0.0,
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    repo.setCandidateStates(familyKey, [{
      candidateId: 'prof-1:tac-1:prov-1',
      familyKey,
      rollingScore: 0.8,
      runCount: 50,
      successRate: 0.9,
      averageLatency: 150,
      lastSelectedAt: now.toISOString(),
    }]);

    const deps = makeDeps({
      adaptiveMode: 'fully_applied',
      optimizerStateRepository: repo,
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision.rationaleSummary).toContain('[adaptive]');
  });

  it('falls back to deterministic when portfolio is empty', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'nonexistent:tac:prov',
      rollingScore: 0.5,
      explorationRate: 0.0,
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    // No provider mapping for profiles means empty portfolio
    const deps = makeDeps({
      adaptiveMode: 'fully_applied',
      optimizerStateRepository: repo,
      profileProviderMap: new Map(),
    });

    // Should fall through to deterministic and fail on no provider
    const originalLog = console.log;
    console.log = () => {};

    try {
      await expect(
        resolver.resolve(makeRequest(), deps),
      ).rejects.toThrow('No provider mapped for profile');
    } finally {
      console.log = originalLog;
    }
  });

  it('works with observe_only adaptive mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'prof-1:tac-1:prov-1',
      rollingScore: 0.7,
      explorationRate: 0.0,
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    repo.setCandidateStates(familyKey, [{
      candidateId: 'prof-1:tac-1:prov-1',
      familyKey,
      rollingScore: 0.7,
      runCount: 20,
      successRate: 0.85,
      averageLatency: 250,
      lastSelectedAt: now.toISOString(),
    }]);

    const deps = makeDeps({
      adaptiveMode: 'observe_only',
      optimizerStateRepository: repo,
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.adaptiveResult).toBeDefined();
    expect(result.adaptiveResult!.explorationUsed).toBe(false);
  });

  it('works with recommend_only adaptive mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'prof-1:tac-1:prov-1',
      rollingScore: 0.7,
      explorationRate: 0.0,
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    repo.setCandidateStates(familyKey, [{
      candidateId: 'prof-1:tac-1:prov-1',
      familyKey,
      rollingScore: 0.7,
      runCount: 20,
      successRate: 0.85,
      averageLatency: 250,
      lastSelectedAt: now.toISOString(),
    }]);

    const deps = makeDeps({
      adaptiveMode: 'recommend_only',
      optimizerStateRepository: repo,
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.adaptiveResult).toBeDefined();
  });

  it('uses multiple profiles and tactics in adaptive mode', async () => {
    const resolver = new AdaptiveDispatchResolver();
    const repo = new InMemoryOptimizerStateRepo();
    const familyKey = 'testapp:review:analyze';

    repo.setFamilyState({
      familyKey,
      currentCandidateId: 'prof-1:tac-1:prov-1',
      rollingScore: 0.6,
      explorationRate: 0.0,
      plateauDetected: false,
      lastAdaptationAt: now.toISOString(),
      recentTrend: 'stable',
    });

    repo.setCandidateStates(familyKey, [
      {
        candidateId: 'prof-1:tac-1:prov-1',
        familyKey,
        rollingScore: 0.9,
        runCount: 50,
        successRate: 0.95,
        averageLatency: 100,
        lastSelectedAt: now.toISOString(),
      },
      {
        candidateId: 'prof-2:tac-1:prov-2',
        familyKey,
        rollingScore: 0.5,
        runCount: 20,
        successRate: 0.8,
        averageLatency: 300,
        lastSelectedAt: now.toISOString(),
      },
    ]);

    const deps = makeDeps({
      allProfiles: [makeProfile('prof-1'), makeProfile('prof-2')],
      allTactics: [makeTactic('tac-1')],
      profileProviderMap: new Map([['prof-1', 'prov-1'], ['prof-2', 'prov-2']]),
      adaptiveMode: 'fully_applied',
      optimizerStateRepository: repo,
    });

    const result = await resolver.resolve(makeRequest(), deps);

    expect(result.decision).toBeDefined();
    expect(result.adaptiveResult).toBeDefined();
    expect(result.adaptiveResult!.rankingSnapshot.length).toBeGreaterThanOrEqual(1);
  });
});
