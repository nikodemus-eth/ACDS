import { describe, it, expect } from 'vitest';
import { DeterministicProfileSelector } from './DeterministicProfileSelector.js';
import { CognitiveGrade, LoadTier, ProviderVendor, TaskType } from '@acds/core-types';
import type { ModelProfile } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

const now = new Date('2026-03-15T10:00:00Z');

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: 'test',
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

describe('DeterministicProfileSelector', () => {
  const selector = new DeterministicProfileSelector();

  it('returns null when no eligible profiles', () => {
    const result = selector.select([], makePolicy());
    expect(result).toBeNull();
  });

  it('returns the first eligible profile by default', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = selector.select(profiles, makePolicy());
    expect(result!.id).toBe('p1');
  });

  it('prefers the policy default profile when eligible', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = selector.select(profiles, makePolicy({ defaultModelProfileId: 'p2' }));
    expect(result!.id).toBe('p2');
  });

  it('ignores the policy default profile when not in eligible list', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const result = selector.select(profiles, makePolicy({ defaultModelProfileId: 'p99' }));
    expect(result!.id).toBe('p1');
  });

  it('prefers cloud-capable profiles when forceEscalation is true', () => {
    const profiles = [
      makeProfile('local', { localOnly: true, cloudAllowed: false }),
      makeProfile('cloud', { localOnly: false, cloudAllowed: true }),
    ];
    const result = selector.select(profiles, makePolicy({ forceEscalation: true }));
    expect(result!.id).toBe('cloud');
  });

  it('falls back to first profile when forceEscalation is true but no cloud profile', () => {
    const profiles = [
      makeProfile('local1', { localOnly: true, cloudAllowed: false }),
      makeProfile('local2', { localOnly: true, cloudAllowed: false }),
    ];
    const result = selector.select(profiles, makePolicy({ forceEscalation: true }));
    expect(result!.id).toBe('local1');
  });

  it('prefers local-only profiles when privacy is local_only', () => {
    const profiles = [
      makeProfile('cloud', { localOnly: false, cloudAllowed: true }),
      makeProfile('local', { localOnly: true, cloudAllowed: false }),
    ];
    const result = selector.select(profiles, makePolicy({ privacy: 'local_only' }));
    expect(result!.id).toBe('local');
  });

  it('falls back to first profile when privacy is local_only but no local profile exists', () => {
    const profiles = [
      makeProfile('cloud1', { localOnly: false, cloudAllowed: true }),
      makeProfile('cloud2', { localOnly: false, cloudAllowed: true }),
    ];
    const result = selector.select(profiles, makePolicy({ privacy: 'local_only' }));
    expect(result!.id).toBe('cloud1');
  });

  it('policy default takes priority over forceEscalation', () => {
    const profiles = [
      makeProfile('p1', { localOnly: true, cloudAllowed: false }),
      makeProfile('p2', { localOnly: false, cloudAllowed: true }),
    ];
    const result = selector.select(
      profiles,
      makePolicy({ defaultModelProfileId: 'p1', forceEscalation: true }),
    );
    expect(result!.id).toBe('p1');
  });

  it('policy default takes priority over local_only privacy preference', () => {
    const profiles = [
      makeProfile('cloud', { localOnly: false, cloudAllowed: true }),
      makeProfile('local', { localOnly: true, cloudAllowed: false }),
    ];
    const result = selector.select(
      profiles,
      makePolicy({ defaultModelProfileId: 'cloud', privacy: 'local_only' }),
    );
    expect(result!.id).toBe('cloud');
  });
});
