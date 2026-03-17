import { describe, it, expect } from 'vitest';
import { DispatchResolver } from './DispatchResolver.js';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';

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

const now = new Date('2026-03-15T10:00:00Z');

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

describe('DispatchResolver', () => {
  it('resolves a routing decision with valid inputs', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map([['prof-1', 'prov-1']]);

    const result = resolver.resolve(makeRequest(), {
      allProfiles: [makeProfile('prof-1')],
      allTactics: [makeTactic('tac-1')],
      profileProviderMap,
      effectivePolicy: makeEffectivePolicy(),
    });

    expect(result.decision).toBeDefined();
    expect(result.decision.selectedModelProfileId).toBe('prof-1');
    expect(result.decision.selectedTacticProfileId).toBe('tac-1');
    expect(result.decision.selectedProviderId).toBe('prov-1');
    expect(result.rationale).toBeDefined();
    expect(result.rationale.routingDecisionId).toBe(result.decision.id);
  });

  it('throws when no eligible profiles exist', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map<string, string>();

    expect(() =>
      resolver.resolve(makeRequest(), {
        allProfiles: [],
        allTactics: [makeTactic('tac-1')],
        profileProviderMap,
        effectivePolicy: makeEffectivePolicy(),
      }),
    ).toThrow('No eligible model profile found');
  });

  it('throws when no eligible tactics exist', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map([['prof-1', 'prov-1']]);

    expect(() =>
      resolver.resolve(makeRequest(), {
        allProfiles: [makeProfile('prof-1')],
        allTactics: [],
        profileProviderMap,
        effectivePolicy: makeEffectivePolicy(),
      }),
    ).toThrow('No eligible tactic profile found');
  });

  it('throws when no provider is mapped for the selected profile', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map<string, string>(); // empty map

    expect(() =>
      resolver.resolve(makeRequest(), {
        allProfiles: [makeProfile('prof-1')],
        allTactics: [makeTactic('tac-1')],
        profileProviderMap,
        effectivePolicy: makeEffectivePolicy(),
      }),
    ).toThrow('No provider mapped for profile');
  });

  it('throws on invalid routing request', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map([['prof-1', 'prov-1']]);

    // Missing required fields
    expect(() =>
      resolver.resolve({ application: '' } as any, {
        allProfiles: [makeProfile('prof-1')],
        allTactics: [makeTactic('tac-1')],
        profileProviderMap,
        effectivePolicy: makeEffectivePolicy(),
      }),
    ).toThrow('Invalid routing request');
  });

  it('builds a fallback chain from remaining eligible profiles', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map([
      ['prof-1', 'prov-1'],
      ['prof-2', 'prov-2'],
    ]);

    const result = resolver.resolve(makeRequest(), {
      allProfiles: [makeProfile('prof-1'), makeProfile('prof-2')],
      allTactics: [makeTactic('tac-1')],
      profileProviderMap,
      effectivePolicy: makeEffectivePolicy(),
    });

    expect(result.decision.fallbackChain.length).toBeGreaterThanOrEqual(1);
    expect(result.decision.fallbackChain[0].modelProfileId).toBe('prof-2');
  });

  it('rationale contains the execution family key', () => {
    const resolver = new DispatchResolver();
    const profileProviderMap = new Map([['prof-1', 'prov-1']]);

    const result = resolver.resolve(makeRequest(), {
      allProfiles: [makeProfile('prof-1')],
      allTactics: [makeTactic('tac-1')],
      profileProviderMap,
      effectivePolicy: makeEffectivePolicy(),
    });

    expect(result.rationale.executionFamilyKey).toContain('testapp');
    expect(result.rationale.executionFamilyKey).toContain('review');
    expect(result.rationale.executionFamilyKey).toContain('analyze');
  });
});
