import { describe, it, expect } from 'vitest';
import { CandidateEvaluator } from './CandidateEvaluator.js';
import {
  TaskType, LoadTier, CognitiveGrade, ProviderVendor, ContextSize, TrustZone,
} from '@acds/core-types';
import type { ModelProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import type { SensitivityPolicyResult } from './SensitivityPolicyResolver.js';

const now = new Date();

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: '',
    vendor: ProviderVendor.OLLAMA,
    modelId: `model_${id}`,
    supportedTaskTypes: Object.values(TaskType),
    supportedLoadTiers: Object.values(LoadTier),
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    contextWindow: 32768,
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    localOnly: true,
    cloudAllowed: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA],
    blockedVendors: [],
    privacy: 'local_only',
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

function makeRequest(): RoutingRequest {
  return {
    application: 'test',
    process: 'triage',
    step: 'test-step',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: 'operational' as any,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: '',
    constraints: {
      privacy: 'local_only',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

function makeSensitivity(zones: TrustZone[] = [TrustZone.LOCAL]): SensitivityPolicyResult {
  return {
    allowedTrustZones: zones,
    externalPermitted: zones.includes(TrustZone.EXTERNAL),
  };
}

describe('CandidateEvaluator', () => {
  const evaluator = new CandidateEvaluator();

  it('marks eligible profiles as eligible', () => {
    const profiles = [makeProfile('p1')];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results).toHaveLength(1);
    expect(results[0].eligible).toBe(true);
    expect(results[0].rejectionReason).toBeNull();
  });

  it('rejects disabled profiles', () => {
    const profiles = [makeProfile('p1', { enabled: false })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results[0].eligible).toBe(false);
    expect(results[0].rejectionReason).toBe('disabled');
  });

  it('rejects blocked profiles', () => {
    const profiles = [makeProfile('p1')];
    const results = evaluator.evaluate(
      profiles, makePolicy({ blockedModelProfileIds: ['p1'] }), makeRequest(),
      makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results[0].eligible).toBe(false);
    expect(results[0].rejectionReason).toBe('policy_blocked');
  });

  it('rejects profiles not in allowlist', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const results = evaluator.evaluate(
      profiles, makePolicy({ allowedModelProfileIds: ['p2'] }), makeRequest(),
      makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results[0].eligible).toBe(false);
    expect(results[0].rejectionReason).toBe('policy_allowlist_excluded');
    expect(results[1].eligible).toBe(true);
  });

  it('rejects profiles that lack required task type', () => {
    const profiles = [makeProfile('p1', { supportedTaskTypes: [TaskType.CODING] })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results[0].rejectionReason).toBe('capability_mismatch');
  });

  it('rejects cloud profiles when trust zone is local only', () => {
    const profiles = [makeProfile('p1', { localOnly: false, cloudAllowed: true })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity([TrustZone.LOCAL]),
      ContextSize.SMALL, null,
    );
    expect(results[0].rejectionReason).toBe('trust_zone_violation');
  });

  it('allows cloud profiles when trust zone permits external', () => {
    const profiles = [makeProfile('p1', { localOnly: false, cloudAllowed: true })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(),
      makeSensitivity([TrustZone.LOCAL, TrustZone.EXTERNAL]),
      ContextSize.SMALL, null,
    );
    expect(results[0].eligible).toBe(true);
  });

  it('rejects profiles with unsupported load tier', () => {
    const profiles = [makeProfile('p1', { supportedLoadTiers: [LoadTier.BATCH] })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.SMALL, null,
    );
    expect(results[0].rejectionReason).toBe('load_tier_unsupported');
  });

  it('evaluates multiple profiles with mixed eligibility', () => {
    const profiles = [
      makeProfile('eligible'),
      makeProfile('disabled', { enabled: false }),
      makeProfile('wrong-task', { supportedTaskTypes: [TaskType.CODING] }),
      makeProfile('cloud-only', { localOnly: false, cloudAllowed: true }),
    ];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity([TrustZone.LOCAL]),
      ContextSize.SMALL, null,
    );
    expect(results[0].eligible).toBe(true);
    expect(results[1].rejectionReason).toBe('disabled');
    expect(results[2].rejectionReason).toBe('capability_mismatch');
    expect(results[3].rejectionReason).toBe('trust_zone_violation');
  });

  it('accepts profiles with sufficient context window for MEDIUM estimate', () => {
    const profiles = [makeProfile('p1', { contextWindow: 32768 })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.MEDIUM, null,
    );
    // MEDIUM = 16384, profile has 32768
    expect(results[0].eligible).toBe(true);
  });

  it('rejects profiles with insufficient context window for LARGE estimate', () => {
    const profiles = [makeProfile('p1', { contextWindow: 32768 })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.LARGE, null,
    );
    // LARGE = 65536, profile has 32768
    expect(results[0].rejectionReason).toBe('context_size_exceeded');
  });

  it('rejects profiles with insufficient context window', () => {
    const profiles = [makeProfile('p1', { contextWindow: 2048 })];
    const results = evaluator.evaluate(
      profiles, makePolicy(), makeRequest(), makeSensitivity(), ContextSize.SMALL, null,
    );
    // SMALL = 4096, profile has 2048
    expect(results[0].rejectionReason).toBe('context_size_exceeded');
  });
});
