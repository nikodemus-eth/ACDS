import { describe, it, expect } from 'vitest';
import { PolicyMergeResolver } from './PolicyMergeResolver.js';
import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';
import type { InstancePolicyOverrides } from '../instance/InstancePolicyOverlay.js';
import { CognitiveGrade, LoadTier } from '@acds/core-types';

function makeGlobal(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'g1',
    allowedVendors: ['openai' as any, 'gemini' as any],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeApp(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'a1',
    application: 'test-app',
    allowedVendors: null,
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProcess(overrides: Partial<ProcessPolicy> = {}): ProcessPolicy {
  return {
    id: 'p1',
    application: 'test-app',
    process: 'test-process',
    step: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: null,
    allowedTacticProfileIds: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    forceEscalationForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOverrides(overrides: Partial<InstancePolicyOverrides> = {}): InstancePolicyOverrides {
  return {
    forceEscalation: false,
    forceLocalOnly: false,
    boostCostSensitivity: false,
    ...overrides,
  };
}

describe('PolicyMergeResolver', () => {
  const resolver = new PolicyMergeResolver();

  it('merges global-only defaults when no application or process policy', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.allowedVendors).toEqual(['openai', 'gemini']);
    expect(result.blockedVendors).toEqual([]);
    expect(result.privacy).toBe('cloud_allowed');
    expect(result.costSensitivity).toBe('medium');
    expect(result.structuredOutputRequired).toBe(false);
    expect(result.traceabilityRequired).toBe(false);
    expect(result.maxLatencyMs).toBeNull();
    expect(result.allowedModelProfileIds).toBeNull();
    expect(result.blockedModelProfileIds).toEqual([]);
    expect(result.allowedTacticProfileIds).toBeNull();
    expect(result.defaultModelProfileId).toBeNull();
    expect(result.defaultTacticProfileId).toBeNull();
    expect(result.forceEscalation).toBe(false);
  });

  it('uses application allowedVendors when present, filtering out blocked', () => {
    const result = resolver.merge(
      makeGlobal({ blockedVendors: ['gemini' as any] }),
      makeApp({ allowedVendors: ['openai' as any, 'gemini' as any] }),
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.allowedVendors).toEqual(['openai']);
    expect(result.blockedVendors).toContain('gemini');
  });

  it('combines blocked vendors from global and application', () => {
    const result = resolver.merge(
      makeGlobal({ blockedVendors: ['ollama' as any] }),
      makeApp({ blockedVendors: ['lmstudio' as any] }),
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.blockedVendors).toContain('ollama');
    expect(result.blockedVendors).toContain('lmstudio');
  });

  it('uses forceLocalOnly override for privacy', () => {
    const result = resolver.merge(
      makeGlobal({ defaultPrivacy: 'cloud_preferred' }),
      makeApp({ privacyOverride: 'cloud_preferred' }),
      null,
      makeOverrides({ forceLocalOnly: true }),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.privacy).toBe('local_only');
  });

  it('uses process privacy override when present', () => {
    const result = resolver.merge(
      makeGlobal({ defaultPrivacy: 'cloud_allowed' }),
      makeApp({ privacyOverride: 'cloud_preferred' }),
      makeProcess({ privacyOverride: 'local_only' }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.privacy).toBe('local_only');
  });

  it('uses application privacy override when no process override', () => {
    const result = resolver.merge(
      makeGlobal({ defaultPrivacy: 'cloud_allowed' }),
      makeApp({ privacyOverride: 'cloud_preferred' }),
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.privacy).toBe('cloud_preferred');
  });

  it('boosts cost sensitivity to high when override is set', () => {
    const result = resolver.merge(
      makeGlobal({ defaultCostSensitivity: 'low' }),
      null,
      null,
      makeOverrides({ boostCostSensitivity: true }),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.costSensitivity).toBe('high');
  });

  it('uses process cost sensitivity override', () => {
    const result = resolver.merge(
      makeGlobal({ defaultCostSensitivity: 'low' }),
      makeApp({ costSensitivityOverride: 'medium' }),
      makeProcess({ costSensitivityOverride: 'high' }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.costSensitivity).toBe('high');
  });

  it('uses application cost sensitivity override when no process override', () => {
    const result = resolver.merge(
      makeGlobal({ defaultCostSensitivity: 'low' }),
      makeApp({ costSensitivityOverride: 'medium' }),
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.costSensitivity).toBe('medium');
  });

  it('requires structured output when global policy matches cognitive grade', () => {
    const result = resolver.merge(
      makeGlobal({ structuredOutputRequiredForGrades: [CognitiveGrade.FRONTIER] }),
      null,
      null,
      makeOverrides(),
      CognitiveGrade.FRONTIER,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.structuredOutputRequired).toBe(true);
  });

  it('requires structured output when application policy matches cognitive grade', () => {
    const result = resolver.merge(
      makeGlobal({ structuredOutputRequiredForGrades: [] }),
      makeApp({ structuredOutputRequiredForGrades: [CognitiveGrade.ENHANCED] }),
      null,
      makeOverrides(),
      CognitiveGrade.ENHANCED,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.structuredOutputRequired).toBe(true);
  });

  it('does not require structured output when grade does not match', () => {
    const result = resolver.merge(
      makeGlobal({ structuredOutputRequiredForGrades: [CognitiveGrade.FRONTIER] }),
      makeApp({ structuredOutputRequiredForGrades: [CognitiveGrade.FRONTIER] }),
      null,
      makeOverrides(),
      CognitiveGrade.BASIC,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.structuredOutputRequired).toBe(false);
  });

  it('requires traceability when global policy matches cognitive grade', () => {
    const result = resolver.merge(
      makeGlobal({ traceabilityRequiredForGrades: [CognitiveGrade.STANDARD] }),
      null,
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.traceabilityRequired).toBe(true);
  });

  it('resolves maxLatencyMs from load tier', () => {
    const result = resolver.merge(
      makeGlobal({ maxLatencyMsByLoadTier: { [LoadTier.SINGLE_SHOT]: 5000 } }),
      null,
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.maxLatencyMs).toBe(5000);
  });

  it('returns null maxLatencyMs when load tier is not in map', () => {
    const result = resolver.merge(
      makeGlobal({ maxLatencyMsByLoadTier: { [LoadTier.SINGLE_SHOT]: 5000 } }),
      null,
      null,
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.BATCH,
    );

    expect(result.maxLatencyMs).toBeNull();
  });

  it('merges blocked model profile ids from application and process', () => {
    const result = resolver.merge(
      makeGlobal(),
      makeApp({ blockedModelProfileIds: ['m1'] }),
      makeProcess({ blockedModelProfileIds: ['m2'] }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.blockedModelProfileIds).toEqual(['m1', 'm2']);
  });

  it('uses process allowedModelProfileIds', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      makeProcess({ allowedModelProfileIds: ['m1', 'm2'] }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.allowedModelProfileIds).toEqual(['m1', 'm2']);
  });

  it('uses process allowedTacticProfileIds', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      makeProcess({ allowedTacticProfileIds: ['t1'] }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.allowedTacticProfileIds).toEqual(['t1']);
  });

  it('uses process defaults for model and tactic', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      makeProcess({ defaultModelProfileId: 'dm1', defaultTacticProfileId: 'dt1' }),
      makeOverrides(),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.defaultModelProfileId).toBe('dm1');
    expect(result.defaultTacticProfileId).toBe('dt1');
  });

  it('forces escalation from instance overrides', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      null,
      makeOverrides({ forceEscalation: true }),
      CognitiveGrade.STANDARD,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.forceEscalation).toBe(true);
  });

  it('forces escalation from process policy for matching grade', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      makeProcess({ forceEscalationForGrades: [CognitiveGrade.FRONTIER] }),
      makeOverrides(),
      CognitiveGrade.FRONTIER,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.forceEscalation).toBe(true);
  });

  it('does not force escalation from process policy for non-matching grade', () => {
    const result = resolver.merge(
      makeGlobal(),
      null,
      makeProcess({ forceEscalationForGrades: [CognitiveGrade.FRONTIER] }),
      makeOverrides(),
      CognitiveGrade.BASIC,
      LoadTier.SINGLE_SHOT,
    );

    expect(result.forceEscalation).toBe(false);
  });
});
