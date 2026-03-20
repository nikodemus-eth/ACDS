import { describe, it, expect } from 'vitest';
import { TacticEligibilityResolver } from './TacticEligibilityResolver.js';
import type { EffectivePolicy } from './PolicyMergeResolver.js';
import type { TacticProfile, RoutingRequest } from '@acds/core-types';
import { TaskType, LoadTier, CognitiveGrade, DecisionPosture } from '@acds/core-types';

function makeTactic(overrides: Partial<TacticProfile> = {}): TacticProfile {
  return {
    id: 'tp-1',
    name: 'Test Tactic',
    description: 'A test tactic',
    executionMethod: 'single_pass',
    systemPromptTemplate: 'You are a helpful assistant.',
    maxRetries: 3,
    temperature: 0.7,
    topP: 1.0,
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
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
    allowedVendors: ['openai' as any],
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
    application: 'TestApp',
    process: 'Review',
    step: 'Analyze',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test',
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

describe('TacticEligibilityResolver', () => {
  const resolver = new TacticEligibilityResolver();

  it('returns enabled tactics that match all criteria', () => {
    const tactics = [makeTactic()];
    const result = resolver.resolve(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tp-1');
  });

  it('excludes disabled tactics', () => {
    const tactics = [makeTactic({ enabled: false })];
    const result = resolver.resolve(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('excludes tactics not in allowedTacticProfileIds when set', () => {
    const tactics = [
      makeTactic({ id: 'tp-1' }),
      makeTactic({ id: 'tp-2' }),
    ];
    const policy = makePolicy({ allowedTacticProfileIds: ['tp-2'] });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tp-2');
  });

  it('includes all tactics when allowedTacticProfileIds is null', () => {
    const tactics = [makeTactic({ id: 'tp-1' }), makeTactic({ id: 'tp-2' })];
    const policy = makePolicy({ allowedTacticProfileIds: null });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(2);
  });

  it('excludes tactics that do not support the task type', () => {
    const tactics = [makeTactic({ supportedTaskTypes: [TaskType.CREATIVE] })];
    const result = resolver.resolve(tactics, makePolicy(), makeRequest({ taskType: TaskType.ANALYTICAL }));
    expect(result).toHaveLength(0);
  });

  it('excludes tactics that do not support the load tier', () => {
    const tactics = [makeTactic({ supportedLoadTiers: [LoadTier.BATCH] })];
    const result = resolver.resolve(tactics, makePolicy(), makeRequest({ loadTier: LoadTier.SINGLE_SHOT }));
    expect(result).toHaveLength(0);
  });

  it('excludes tactics without structured output when policy requires it', () => {
    const tactics = [makeTactic({ requiresStructuredOutput: false })];
    const policy = makePolicy({ structuredOutputRequired: true });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(0);
  });

  it('includes tactics with structured output when policy requires it', () => {
    const tactics = [makeTactic({ requiresStructuredOutput: true })];
    const policy = makePolicy({ structuredOutputRequired: true });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('does not filter by structured output when policy does not require it', () => {
    const tactics = [makeTactic({ requiresStructuredOutput: false })];
    const policy = makePolicy({ structuredOutputRequired: false });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('returns empty when no tactics are provided', () => {
    const result = resolver.resolve([], makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters multiple criteria together', () => {
    const tactics = [
      makeTactic({ id: 'a', enabled: true, requiresStructuredOutput: true }),
      makeTactic({ id: 'b', enabled: false }),
      makeTactic({ id: 'c', enabled: true, supportedTaskTypes: [TaskType.CREATIVE] }),
      makeTactic({ id: 'd', enabled: true, requiresStructuredOutput: false }),
    ];
    const policy = makePolicy({ structuredOutputRequired: true });
    const result = resolver.resolve(tactics, policy, makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});
