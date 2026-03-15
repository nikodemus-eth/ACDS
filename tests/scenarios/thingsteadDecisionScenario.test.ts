// ---------------------------------------------------------------------------
// Scenario Test – Thingstead Governance Decision Escalation
// ---------------------------------------------------------------------------
// Simulates: governance advisory request -> local routing -> advisor posture
//            -> then final decision escalation to frontier model.
// Verifies:  routing decision selects local provider for advisory,
//            escalates for final.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { RoutingRequest, ModelProfile, TacticProfile } from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { DispatchResolver } from '@acds/routing-engine';
import type { DispatchResolverDeps } from '@acds/routing-engine';

// ---------------------------------------------------------------------------
// Fixtures: model profiles representing local and frontier providers
// ---------------------------------------------------------------------------
const localAdvisoryProfile: ModelProfile = {
  id: 'profile-local-advisor',
  name: 'Local Governance Advisor',
  description: 'Local model tuned for governance advisory tasks',
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYSIS],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE],
  minimumCognitiveGrade: CognitiveGrade.WORKING,
  localOnly: true,
  cloudAllowed: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const frontierDecisionProfile: ModelProfile = {
  id: 'profile-frontier-decider',
  name: 'Frontier Decision Model',
  description: 'Cloud frontier model for final governance decisions',
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYSIS, TaskType.CRITIQUE],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  minimumCognitiveGrade: CognitiveGrade.STRONG,
  localOnly: false,
  cloudAllowed: true,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const advisoryTactic: TacticProfile = {
  id: 'tactic-advisory',
  name: 'Advisory Analysis',
  description: 'Single-prompt advisory analysis tactic',
  executionMethod: 'advisory_prompt',
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYSIS],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  multiStage: false,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const profileProviderMap = new Map<string, string>([
  ['profile-local-advisor', 'provider-ollama-local'],
  ['profile-frontier-decider', 'provider-openai-frontier'],
]);

// ---------------------------------------------------------------------------
// Policy helpers
// ---------------------------------------------------------------------------
function makeLocalPolicy(): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA, ProviderVendor.OPENAI],
    blockedVendors: [],
    privacy: 'local_only',
    costSensitivity: 'high',
    structuredOutputRequired: false,
    traceabilityRequired: false,
    maxLatencyMs: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: false,
  };
}

function makeEscalationPolicy(): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA, ProviderVendor.OPENAI],
    blockedVendors: [],
    privacy: 'cloud_allowed',
    costSensitivity: 'low',
    structuredOutputRequired: false,
    traceabilityRequired: true,
    maxLatencyMs: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: true,
  };
}

// ===========================================================================
// Scenario Tests
// ===========================================================================

describe('Scenario: Thingstead Governance Decision Escalation', () => {
  const resolver = new DispatchResolver();

  it('routes advisory request to a local provider', () => {
    const advisoryRequest: RoutingRequest = {
      application: 'thingstead',
      process: 'governance',
      step: 'advisory',
      taskType: TaskType.DECISION_SUPPORT,
      loadTier: LoadTier.SIMPLE,
      decisionPosture: DecisionPosture.ADVISORY,
      cognitiveGrade: CognitiveGrade.WORKING,
      constraints: {
        privacy: 'local_only',
        maxLatencyMs: null,
        costSensitivity: 'high',
        structuredOutputRequired: false,
        traceabilityRequired: false,
      },
    };

    const deps: DispatchResolverDeps = {
      allProfiles: [localAdvisoryProfile, frontierDecisionProfile],
      allTactics: [advisoryTactic],
      profileProviderMap,
      effectivePolicy: makeLocalPolicy(),
    };

    const result = resolver.resolve(advisoryRequest, deps);

    // Routing decision should select local provider for advisory
    expect(result.decision.selectedModelProfileId).toBe('profile-local-advisor');
    expect(result.decision.selectedProviderId).toBe('provider-ollama-local');
    expect(result.decision.selectedTacticProfileId).toBe('tactic-advisory');

    // Rationale should explain the selection
    expect(result.rationale.selectedProfileReason).toContain('Local Governance Advisor');
    expect(result.rationale.policyMatchSummary).toContain('local_only');

    // Execution result shape is valid
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.resolvedAt).toBeInstanceOf(Date);
    expect(result.rationale.eligibleProfileCount).toBe(1); // Only local profile is eligible
  });

  it('escalates final decision to frontier model', () => {
    const finalRequest: RoutingRequest = {
      application: 'thingstead',
      process: 'governance',
      step: 'final-decision',
      taskType: TaskType.DECISION_SUPPORT,
      loadTier: LoadTier.MODERATE,
      decisionPosture: DecisionPosture.FINAL,
      cognitiveGrade: CognitiveGrade.STRONG,
      constraints: {
        privacy: 'cloud_allowed',
        maxLatencyMs: null,
        costSensitivity: 'low',
        structuredOutputRequired: false,
        traceabilityRequired: true,
      },
    };

    const deps: DispatchResolverDeps = {
      allProfiles: [localAdvisoryProfile, frontierDecisionProfile],
      allTactics: [advisoryTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(finalRequest, deps);

    // Escalation should select the frontier cloud provider
    expect(result.decision.selectedProviderId).toBe('provider-openai-frontier');
    expect(result.decision.selectedModelProfileId).toBe('profile-frontier-decider');

    // Rationale should reflect escalation policy
    expect(result.rationale.policyMatchSummary).toContain('Escalation: true');
    expect(result.rationale.selectedProfileReason).toContain('Frontier Decision Model');

    // Result shape is valid
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.rationaleId).toBe(result.rationale.id);
    expect(result.rationale.eligibleProfileCount).toBeGreaterThanOrEqual(1);
  });

  it('advisory routing has frontier model in fallback chain', () => {
    const advisoryRequest: RoutingRequest = {
      application: 'thingstead',
      process: 'governance',
      step: 'advisory',
      taskType: TaskType.DECISION_SUPPORT,
      loadTier: LoadTier.MODERATE,
      decisionPosture: DecisionPosture.ADVISORY,
      cognitiveGrade: CognitiveGrade.WORKING,
      constraints: {
        privacy: 'cloud_allowed',
        maxLatencyMs: null,
        costSensitivity: 'medium',
        structuredOutputRequired: false,
        traceabilityRequired: false,
      },
    };

    // Use a cloud_allowed policy so both profiles are eligible
    const deps: DispatchResolverDeps = {
      allProfiles: [localAdvisoryProfile, frontierDecisionProfile],
      allTactics: [advisoryTactic],
      profileProviderMap,
      effectivePolicy: {
        ...makeLocalPolicy(),
        privacy: 'cloud_allowed',
      },
    };

    const result = resolver.resolve(advisoryRequest, deps);

    // Primary should be local (first in list), fallback should include frontier
    expect(result.decision.fallbackChain.length).toBeGreaterThan(0);
    const fallbackProviderIds = result.decision.fallbackChain.map((f) => f.providerId);
    const fallbackModelIds = result.decision.fallbackChain.map((f) => f.modelProfileId);

    // The non-selected profile should appear in the fallback chain
    expect(
      fallbackProviderIds.includes('provider-openai-frontier') ||
      fallbackModelIds.includes('profile-frontier-decider'),
    ).toBe(true);
  });
});
