import { describe, it, expect } from 'vitest';
import { EligibleProfilesService } from './EligibleProfilesService.js';
import {
  CognitiveGrade,
  DecisionPosture,
  LoadTier,
  ProviderVendor,
  TaskType,
} from '@acds/core-types';
import type { ModelProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

const now = new Date('2026-03-15T10:00:00Z');

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: 'test profile',
    vendor: ProviderVendor.OPENAI,
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

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
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
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

function makePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    allowedVendors: [],
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

describe('EligibleProfilesService', () => {
  const service = new EligibleProfilesService();

  it('returns eligible profiles that match all criteria', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = service.computeEligible(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(2);
  });

  it('filters out disabled profiles', () => {
    const profiles = [makeProfile('p1', { enabled: false })];
    const result = service.computeEligible(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters out blocked profiles', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = service.computeEligible(
      profiles,
      makePolicy({ blockedModelProfileIds: ['p1'] }),
      makeRequest(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('filters by allowlist when set', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = service.computeEligible(
      profiles,
      makePolicy({ allowedModelProfileIds: ['p2'] }),
      makeRequest(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('filters out profiles that do not support the task type', () => {
    const profiles = [makeProfile('p1', { supportedTaskTypes: [TaskType.CODING] })];
    const result = service.computeEligible(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters out profiles that do not support the load tier', () => {
    const profiles = [makeProfile('p1', { supportedLoadTiers: [LoadTier.BATCH] })];
    const result = service.computeEligible(profiles, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters out non-local profiles when privacy is local_only', () => {
    const profiles = [makeProfile('p1', { localOnly: false })];
    const result = service.computeEligible(
      profiles,
      makePolicy({ privacy: 'local_only' }),
      makeRequest(),
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no profiles are provided', () => {
    const result = service.computeEligible([], makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });
});
