import { describe, it, expect } from 'vitest';
import { ProfileEligibilityResolver } from './ProfileEligibilityResolver.js';
import type { EffectivePolicy } from './PolicyMergeResolver.js';
import type { ModelProfile, RoutingRequest } from '@acds/core-types';
import { TaskType, LoadTier, CognitiveGrade, DecisionPosture } from '@acds/core-types';

function makeProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'mp-1',
    name: 'Test Model',
    description: 'A test model',
    vendor: 'openai' as any,
    modelId: 'gpt-4',
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    contextWindow: 128000,
    maxTokens: 4096,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    localOnly: false,
    cloudAllowed: true,
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

describe('ProfileEligibilityResolver', () => {
  const resolver = new ProfileEligibilityResolver();

  it('returns enabled profiles that match all criteria', () => {
    const profiles = [makeProfile()];
    const result = resolver.resolve(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mp-1');
  });

  it('excludes disabled profiles', () => {
    const profiles = [makeProfile({ enabled: false })];
    const result = resolver.resolve(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('excludes blocked model profile ids', () => {
    const profiles = [makeProfile({ id: 'mp-blocked' })];
    const policy = makePolicy({ blockedModelProfileIds: ['mp-blocked'] });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(0);
  });

  it('excludes profiles not in allowedModelProfileIds when set', () => {
    const profiles = [
      makeProfile({ id: 'mp-1' }),
      makeProfile({ id: 'mp-2' }),
    ];
    const policy = makePolicy({ allowedModelProfileIds: ['mp-2'] });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mp-2');
  });

  it('includes all profiles when allowedModelProfileIds is null', () => {
    const profiles = [makeProfile({ id: 'mp-1' }), makeProfile({ id: 'mp-2' })];
    const policy = makePolicy({ allowedModelProfileIds: null });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(2);
  });

  it('excludes profiles that do not support the task type', () => {
    const profiles = [makeProfile({ supportedTaskTypes: [TaskType.CREATIVE] })];
    const result = resolver.resolve(profiles, makePolicy(), makeRequest({ taskType: TaskType.ANALYTICAL }));
    expect(result).toHaveLength(0);
  });

  it('excludes profiles that do not support the load tier', () => {
    const profiles = [makeProfile({ supportedLoadTiers: [LoadTier.BATCH] })];
    const result = resolver.resolve(profiles, makePolicy(), makeRequest({ loadTier: LoadTier.SINGLE_SHOT }));
    expect(result).toHaveLength(0);
  });

  it('excludes non-local profiles when privacy is local_only', () => {
    const profiles = [makeProfile({ localOnly: false })];
    const policy = makePolicy({ privacy: 'local_only' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(0);
  });

  it('includes local profiles when privacy is local_only', () => {
    const profiles = [makeProfile({ localOnly: true })];
    const policy = makePolicy({ privacy: 'local_only' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('excludes profiles that are neither cloud nor local when privacy is cloud_preferred', () => {
    const profiles = [makeProfile({ cloudAllowed: false, localOnly: false })];
    const policy = makePolicy({ privacy: 'cloud_preferred' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(0);
  });

  it('includes cloud profiles when privacy is cloud_preferred', () => {
    const profiles = [makeProfile({ cloudAllowed: true, localOnly: false })];
    const policy = makePolicy({ privacy: 'cloud_preferred' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('includes local profiles when privacy is cloud_preferred', () => {
    const profiles = [makeProfile({ cloudAllowed: false, localOnly: true })];
    const policy = makePolicy({ privacy: 'cloud_preferred' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('does not filter by privacy for cloud_allowed', () => {
    const profiles = [makeProfile({ cloudAllowed: false, localOnly: false })];
    const policy = makePolicy({ privacy: 'cloud_allowed' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
  });

  it('returns empty when no profiles are provided', () => {
    const result = resolver.resolve([], makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters multiple criteria together', () => {
    const profiles = [
      makeProfile({ id: 'a', enabled: true, supportedTaskTypes: [TaskType.ANALYTICAL], localOnly: true }),
      makeProfile({ id: 'b', enabled: false }),
      makeProfile({ id: 'c', enabled: true, supportedTaskTypes: [TaskType.CREATIVE] }),
    ];
    const policy = makePolicy({ privacy: 'local_only' });
    const result = resolver.resolve(profiles, policy, makeRequest());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});
