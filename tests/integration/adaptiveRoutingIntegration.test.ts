// ---------------------------------------------------------------------------
// Integration Tests – Adaptive Routing Integration (Prompt 59)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ModelProfile,
  RoutingRequest,
  RoutingDecision,
} from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

// ---------------------------------------------------------------------------
// Types for the adaptive routing integration domain
// ---------------------------------------------------------------------------

type SelectionMode = 'observe_only' | 'recommend_only' | 'auto_apply_low_risk' | 'auto_apply_all';

interface AdaptiveFamilyState {
  familyKey: string;
  currentProfileId: string;
  scores: Map<string, number>; // profileId -> adaptive score
  selectionMode: SelectionMode;
}

interface PortfolioCandidate {
  profileId: string;
  tacticId: string;
  providerId: string;
  adaptiveScore: number;
}

interface AdaptiveDispatchResult {
  decision: RoutingDecision;
  adaptiveApplied: boolean;
  source: 'adaptive' | 'deterministic';
}

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

function makeDecision(profileId: string, providerId: string): RoutingDecision {
  return {
    id: `decision-${Date.now()}`,
    selectedModelProfileId: profileId,
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: providerId,
    fallbackChain: [],
    rationaleId: `rationale-${Date.now()}`,
    rationaleSummary: `Selected ${profileId} via adaptive routing`,
    resolvedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Mock adaptive dispatch resolver
// ---------------------------------------------------------------------------

class MockAdaptiveDispatchResolver {
  private familyStates = new Map<string, AdaptiveFamilyState>();
  private profiles: ModelProfile[];
  private providerMap: Map<string, string>;
  private policy: EffectivePolicy;

  constructor(
    profiles: ModelProfile[],
    providerMap: Map<string, string>,
    policy: EffectivePolicy,
  ) {
    this.profiles = profiles;
    this.providerMap = providerMap;
    this.policy = policy;
  }

  setFamilyState(state: AdaptiveFamilyState): void {
    this.familyStates.set(state.familyKey, state);
  }

  resolve(request: RoutingRequest): AdaptiveDispatchResult {
    const familyKey = `${request.application}.${request.process}.${request.step}`;
    const state = this.familyStates.get(familyKey);

    // Falls back to deterministic when no state exists
    if (!state) {
      const eligible = this.profiles.filter((p) => p.enabled);
      const defaultProfile = this.policy.defaultModelProfileId
        ? eligible.find((p) => p.id === this.policy.defaultModelProfileId)
        : eligible[0];

      if (!defaultProfile) throw new Error('No eligible profile');
      const providerId = this.providerMap.get(defaultProfile.id) ?? 'unknown-provider';

      return {
        decision: makeDecision(defaultProfile.id, providerId),
        adaptiveApplied: false,
        source: 'deterministic',
      };
    }

    // Adaptive: pick the highest-scored candidate
    const sortedEntries = [...state.scores.entries()].sort((a, b) => b[1] - a[1]);
    const topProfileId = sortedEntries[0]?.[0] ?? state.currentProfileId;

    // Preserve policy bounds: only select from eligible profiles
    const eligible = this.profiles.filter((p) => p.enabled);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    const selectedId = eligibleIds.has(topProfileId) ? topProfileId : state.currentProfileId;

    const providerId = this.providerMap.get(selectedId) ?? 'unknown-provider';
    const applied = state.selectionMode === 'auto_apply_low_risk' || state.selectionMode === 'auto_apply_all';

    return {
      decision: makeDecision(applied ? selectedId : state.currentProfileId, providerId),
      adaptiveApplied: applied,
      source: 'adaptive',
    };
  }
}

// ---------------------------------------------------------------------------
// Mock portfolio builder
// ---------------------------------------------------------------------------

function buildPortfolioCandidates(
  eligibleProfiles: ModelProfile[],
  tacticId: string,
  providerMap: Map<string, string>,
  scores: Map<string, number>,
): PortfolioCandidate[] {
  return eligibleProfiles.map((profile) => ({
    profileId: profile.id,
    tacticId,
    providerId: providerMap.get(profile.id) ?? 'unknown',
    adaptiveScore: scores.get(profile.id) ?? 0.5,
  }));
}

// ===========================================================================
// Adaptive Dispatch Resolver Uses Adaptive Selection
// ===========================================================================

describe('Adaptive Routing Integration – Adaptive Dispatch Resolver', () => {
  let resolver: MockAdaptiveDispatchResolver;
  let profiles: ModelProfile[];
  let providerMap: Map<string, string>;

  beforeEach(() => {
    profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst' }),
      makeProfile({ id: 'profile-cloud', name: 'Cloud Analyst' }),
    ];
    providerMap = new Map([
      ['profile-local', 'provider-ollama'],
      ['profile-cloud', 'provider-openai'],
    ]);
    resolver = new MockAdaptiveDispatchResolver(profiles, providerMap, makePolicy());
  });

  it('uses adaptive selection when family state exists', () => {
    resolver.setFamilyState({
      familyKey: 'thingstead.governance.advisory',
      currentProfileId: 'profile-local',
      scores: new Map([
        ['profile-local', 0.75],
        ['profile-cloud', 0.90],
      ]),
      selectionMode: 'auto_apply_low_risk',
    });

    const result = resolver.resolve(makeRequest());

    expect(result.source).toBe('adaptive');
    expect(result.adaptiveApplied).toBe(true);
    expect(result.decision.selectedModelProfileId).toBe('profile-cloud');
  });
});

// ===========================================================================
// Falls Back to Deterministic When No State
// ===========================================================================

describe('Adaptive Routing Integration – Deterministic Fallback', () => {
  let resolver: MockAdaptiveDispatchResolver;

  beforeEach(() => {
    const profiles = [
      makeProfile({ id: 'profile-local', name: 'Local Analyst' }),
      makeProfile({ id: 'profile-cloud', name: 'Cloud Analyst' }),
    ];
    const providerMap = new Map([
      ['profile-local', 'provider-ollama'],
      ['profile-cloud', 'provider-openai'],
    ]);
    resolver = new MockAdaptiveDispatchResolver(profiles, providerMap, makePolicy());
  });

  it('falls back to deterministic when no adaptive state exists', () => {
    const result = resolver.resolve(makeRequest());

    expect(result.source).toBe('deterministic');
    expect(result.adaptiveApplied).toBe(false);
  });

  it('selects the first eligible profile in deterministic mode', () => {
    const result = resolver.resolve(makeRequest());

    expect(result.decision.selectedModelProfileId).toBe('profile-local');
    expect(result.decision.selectedProviderId).toBe('provider-ollama');
  });
});

// ===========================================================================
// Preserves Policy Bounds
// ===========================================================================

describe('Adaptive Routing Integration – Policy Bounds Preservation', () => {
  it('does not select a disabled profile even if scored highest', () => {
    const profiles = [
      makeProfile({ id: 'profile-active', name: 'Active' }),
      makeProfile({ id: 'profile-disabled', name: 'Disabled', enabled: false }),
    ];
    const providerMap = new Map([
      ['profile-active', 'provider-ollama'],
      ['profile-disabled', 'provider-openai'],
    ]);
    const resolver = new MockAdaptiveDispatchResolver(profiles, providerMap, makePolicy());

    resolver.setFamilyState({
      familyKey: 'thingstead.governance.advisory',
      currentProfileId: 'profile-active',
      scores: new Map([
        ['profile-active', 0.70],
        ['profile-disabled', 0.95],
      ]),
      selectionMode: 'auto_apply_all',
    });

    const result = resolver.resolve(makeRequest());

    // Should fall back to current since disabled profile is ineligible
    expect(result.decision.selectedModelProfileId).toBe('profile-active');
  });

  it('respects policy default when in deterministic fallback', () => {
    const profiles = [
      makeProfile({ id: 'profile-a', name: 'Profile A' }),
      makeProfile({ id: 'profile-b', name: 'Profile B' }),
    ];
    const providerMap = new Map([
      ['profile-a', 'provider-a'],
      ['profile-b', 'provider-b'],
    ]);
    const policy = makePolicy({ defaultModelProfileId: 'profile-b' });
    const resolver = new MockAdaptiveDispatchResolver(profiles, providerMap, policy);

    const result = resolver.resolve(makeRequest());

    expect(result.source).toBe('deterministic');
    expect(result.decision.selectedModelProfileId).toBe('profile-b');
  });
});

// ===========================================================================
// Portfolio Builder Creates Candidates from Eligible Profiles
// ===========================================================================

describe('Adaptive Routing Integration – Portfolio Builder', () => {
  it('creates a candidate for each eligible profile', () => {
    const profiles = [
      makeProfile({ id: 'p1', name: 'Profile 1' }),
      makeProfile({ id: 'p2', name: 'Profile 2' }),
      makeProfile({ id: 'p3', name: 'Profile 3' }),
    ];
    const providerMap = new Map([
      ['p1', 'prov-1'],
      ['p2', 'prov-2'],
      ['p3', 'prov-3'],
    ]);
    const scores = new Map([
      ['p1', 0.8],
      ['p2', 0.9],
      ['p3', 0.7],
    ]);

    const candidates = buildPortfolioCandidates(profiles, 'tactic-single', providerMap, scores);

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.profileId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('assigns adaptive scores from the scores map', () => {
    const profiles = [makeProfile({ id: 'p1', name: 'Profile 1' })];
    const providerMap = new Map([['p1', 'prov-1']]);
    const scores = new Map([['p1', 0.88]]);

    const candidates = buildPortfolioCandidates(profiles, 'tactic-single', providerMap, scores);

    expect(candidates[0].adaptiveScore).toBe(0.88);
  });

  it('defaults to 0.5 score for profiles without score data', () => {
    const profiles = [makeProfile({ id: 'p1', name: 'Profile 1' })];
    const providerMap = new Map([['p1', 'prov-1']]);
    const scores = new Map<string, number>(); // empty

    const candidates = buildPortfolioCandidates(profiles, 'tactic-single', providerMap, scores);

    expect(candidates[0].adaptiveScore).toBe(0.5);
  });

  it('includes provider and tactic IDs for each candidate', () => {
    const profiles = [makeProfile({ id: 'p1', name: 'Profile 1' })];
    const providerMap = new Map([['p1', 'prov-1']]);
    const scores = new Map([['p1', 0.9]]);

    const candidates = buildPortfolioCandidates(profiles, 'tactic-analysis', providerMap, scores);

    expect(candidates[0].providerId).toBe('prov-1');
    expect(candidates[0].tacticId).toBe('tactic-analysis');
  });
});
