// ---------------------------------------------------------------------------
// Integration Tests – Routing Engine
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelProfile, TacticProfile, RoutingRequest } from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import {
  EligibleProfilesService,
  EligibleTacticsService,
  DeterministicProfileSelector,
  DeterministicTacticSelector,
} from '@acds/routing-engine';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
function makeProfile(overrides: Partial<ModelProfile> & { id: string; name: string }): ModelProfile {
  return {
    description: 'Test profile',
    supportedTaskTypes: [TaskType.ANALYSIS],
    supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE],
    minimumCognitiveGrade: CognitiveGrade.UTILITY,
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
    supportedTaskTypes: [TaskType.ANALYSIS],
    supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE],
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
    taskType: TaskType.ANALYSIS,
    loadTier: LoadTier.SIMPLE,
    decisionPosture: DecisionPosture.ADVISORY,
    cognitiveGrade: CognitiveGrade.WORKING,
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
// Eligibility Calculation Tests
// ===========================================================================

describe('Routing Engine – Eligibility Calculation', () => {
  let profilesService: EligibleProfilesService;
  let tacticsService: EligibleTacticsService;

  beforeEach(() => {
    profilesService = new EligibleProfilesService();
    tacticsService = new EligibleTacticsService();
  });

  it('filters profiles by task type', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Analysis Model', supportedTaskTypes: [TaskType.ANALYSIS] }),
      makeProfile({ id: 'p2', name: 'Creative Model', supportedTaskTypes: [TaskType.CREATIVE] }),
    ];
    const policy = makePolicy();
    const request = makeRequest({ taskType: TaskType.ANALYSIS });

    const eligible = profilesService.computeEligible(profiles, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('p1');
  });

  it('filters profiles by load tier', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Simple Only', supportedLoadTiers: [LoadTier.SIMPLE] }),
      makeProfile({ id: 'p2', name: 'Complex Only', supportedLoadTiers: [LoadTier.COMPLEX] }),
    ];
    const policy = makePolicy();
    const request = makeRequest({ loadTier: LoadTier.SIMPLE });

    const eligible = profilesService.computeEligible(profiles, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('p1');
  });

  it('filters profiles by policy (local_only excludes cloud)', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Local', localOnly: true, cloudAllowed: false }),
      makeProfile({ id: 'p2', name: 'Cloud', localOnly: false, cloudAllowed: true }),
    ];
    const policy = makePolicy({ privacy: 'local_only' });
    const request = makeRequest();

    const eligible = profilesService.computeEligible(profiles, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('p1');
  });

  it('excludes blocked profiles', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Allowed' }),
      makeProfile({ id: 'p2', name: 'Blocked' }),
    ];
    const policy = makePolicy({ blockedModelProfileIds: ['p2'] });
    const request = makeRequest();

    const eligible = profilesService.computeEligible(profiles, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('p1');
  });

  it('excludes disabled profiles', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Active' }),
      makeProfile({ id: 'p2', name: 'Disabled', enabled: false }),
    ];
    const policy = makePolicy();
    const request = makeRequest();

    const eligible = profilesService.computeEligible(profiles, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('p1');
  });

  it('filters tactics by task type and load tier', () => {
    const tactics = [
      makeTactic({ id: 't1', name: 'Analysis Tactic', supportedTaskTypes: [TaskType.ANALYSIS] }),
      makeTactic({ id: 't2', name: 'Creative Tactic', supportedTaskTypes: [TaskType.CREATIVE] }),
    ];
    const policy = makePolicy();
    const request = makeRequest({ taskType: TaskType.ANALYSIS });

    const eligible = tacticsService.computeEligible(tactics, policy, request);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('t1');
  });
});

// ===========================================================================
// Deterministic Profile Selection Tests
// ===========================================================================

describe('Routing Engine – Deterministic Profile Selection', () => {
  let selector: DeterministicProfileSelector;

  beforeEach(() => {
    selector = new DeterministicProfileSelector();
  });

  it('prefers the policy default model profile', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'First' }),
      makeProfile({ id: 'p2', name: 'Default' }),
    ];
    const policy = makePolicy({ defaultModelProfileId: 'p2' });

    const selected = selector.select(profiles, policy);
    expect(selected).toBeDefined();
    expect(selected!.id).toBe('p2');
  });

  it('prefers local-only when policy is local_only', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Cloud', localOnly: false }),
      makeProfile({ id: 'p2', name: 'Local', localOnly: true }),
    ];
    const policy = makePolicy({ privacy: 'local_only' });

    const selected = selector.select(profiles, policy);
    expect(selected).toBeDefined();
    expect(selected!.id).toBe('p2');
  });

  it('falls back to first eligible when no default or local preference', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'First' }),
      makeProfile({ id: 'p2', name: 'Second' }),
    ];
    const policy = makePolicy();

    const selected = selector.select(profiles, policy);
    expect(selected).toBeDefined();
    expect(selected!.id).toBe('p1');
  });

  it('returns null when no profiles are eligible', () => {
    const policy = makePolicy();
    const selected = selector.select([], policy);
    expect(selected).toBeNull();
  });
});

// ===========================================================================
// Tactic Selection Tests
// ===========================================================================

describe('Routing Engine – Tactic Selection', () => {
  let selector: DeterministicTacticSelector;

  beforeEach(() => {
    selector = new DeterministicTacticSelector();
  });

  it('prefers policy default tactic', () => {
    const tactics = [
      makeTactic({ id: 't1', name: 'First' }),
      makeTactic({ id: 't2', name: 'Default' }),
    ];
    const policy = makePolicy({ defaultTacticProfileId: 't2' });

    const selected = selector.select(tactics, policy);
    expect(selected).toBeDefined();
    expect(selected!.id).toBe('t2');
  });

  it('prefers single-stage tactics when no default', () => {
    const tactics = [
      makeTactic({ id: 't1', name: 'Multi', multiStage: true }),
      makeTactic({ id: 't2', name: 'Single', multiStage: false }),
    ];
    const policy = makePolicy();

    const selected = selector.select(tactics, policy);
    expect(selected).toBeDefined();
    expect(selected!.id).toBe('t2');
  });

  it('returns null when no tactics are eligible', () => {
    const policy = makePolicy();
    const selected = selector.select([], policy);
    expect(selected).toBeNull();
  });
});
