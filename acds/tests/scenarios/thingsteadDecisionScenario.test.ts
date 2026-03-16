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
  vendor: ProviderVendor.OLLAMA,
  modelId: 'test-model',
  contextWindow: 32768,
  maxTokens: 4096,
  costPer1kInput: 0,
  costPer1kOutput: 0,
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYTICAL],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
  minimumCognitiveGrade: CognitiveGrade.STANDARD,
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
  vendor: ProviderVendor.OPENAI,
  modelId: 'gpt-4',
  contextWindow: 128000,
  maxTokens: 8192,
  costPer1kInput: 0.03,
  costPer1kOutput: 0.06,
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYTICAL, TaskType.CRITIQUE],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
  minimumCognitiveGrade: CognitiveGrade.ENHANCED,
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
  systemPromptTemplate: 'You are a helpful assistant.',
  maxRetries: 2,
  temperature: 0.7,
  topP: 0.9,
  supportedTaskTypes: [TaskType.DECISION_SUPPORT, TaskType.ANALYTICAL],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
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
      loadTier: LoadTier.SINGLE_SHOT,
      decisionPosture: DecisionPosture.ADVISORY,
      cognitiveGrade: CognitiveGrade.STANDARD,
      input: 'test input',
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
      loadTier: LoadTier.BATCH,
      decisionPosture: DecisionPosture.FINAL,
      cognitiveGrade: CognitiveGrade.ENHANCED,
      input: 'test input',
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
      loadTier: LoadTier.BATCH,
      decisionPosture: DecisionPosture.ADVISORY,
      cognitiveGrade: CognitiveGrade.STANDARD,
      input: 'test input',
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
