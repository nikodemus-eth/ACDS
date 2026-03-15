// ---------------------------------------------------------------------------
// Scenario Test – Cloud Escalation for Complex Reasoning
// ---------------------------------------------------------------------------
// Simulates: complex reasoning task -> frontier provider.
// Verifies:  cloud provider selected, strong cognitive grade,
//            rationale explains escalation.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import type { RoutingRequest, ModelProfile, TacticProfile } from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { DispatchResolver } from '@acds/routing-engine';
import type { DispatchResolverDeps } from '@acds/routing-engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const localWorkingProfile: ModelProfile = {
  id: 'profile-local-working',
  name: 'Local Working Model',
  description: 'Local model adequate for moderate tasks',
  supportedTaskTypes: [TaskType.ANALYSIS, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE],
  minimumCognitiveGrade: CognitiveGrade.WORKING,
  localOnly: true,
  cloudAllowed: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const cloudFrontierProfile: ModelProfile = {
  id: 'profile-cloud-frontier',
  name: 'Cloud Frontier Reasoner',
  description: 'High-capability cloud model for complex reasoning and critique',
  supportedTaskTypes: [TaskType.ANALYSIS, TaskType.CRITIQUE, TaskType.PLANNING, TaskType.DECISION_SUPPORT],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  minimumCognitiveGrade: CognitiveGrade.STRONG,
  localOnly: false,
  cloudAllowed: true,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const complexReasoningTactic: TacticProfile = {
  id: 'tactic-complex-reasoning',
  name: 'Complex Reasoning Chain',
  description: 'Multi-stage reasoning tactic for complex analysis',
  executionMethod: 'chain_of_thought',
  supportedTaskTypes: [TaskType.ANALYSIS, TaskType.CRITIQUE, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.MODERATE, LoadTier.COMPLEX],
  multiStage: true,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const singlePromptTactic: TacticProfile = {
  id: 'tactic-single-prompt',
  name: 'Single Prompt',
  description: 'Simple single-prompt tactic',
  executionMethod: 'single_prompt',
  supportedTaskTypes: [TaskType.ANALYSIS, TaskType.CRITIQUE, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  multiStage: false,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const profileProviderMap = new Map<string, string>([
  ['profile-local-working', 'provider-ollama-local'],
  ['profile-cloud-frontier', 'provider-openai-frontier'],
]);

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
    defaultModelProfileId: 'profile-cloud-frontier',
    defaultTacticProfileId: null,
    forceEscalation: true,
  };
}

// ===========================================================================
// Scenario Tests
// ===========================================================================

describe('Scenario: Cloud Escalation for Complex Reasoning', () => {
  const resolver = new DispatchResolver();

  it('selects cloud frontier provider for complex reasoning task', () => {
    const request: RoutingRequest = {
      application: 'thingstead',
      process: 'risk-analysis',
      step: 'deep-analysis',
      taskType: TaskType.ANALYSIS,
      loadTier: LoadTier.COMPLEX,
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
      allProfiles: [localWorkingProfile, cloudFrontierProfile],
      allTactics: [complexReasoningTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Cloud frontier should be selected (policy default)
    expect(result.decision.selectedModelProfileId).toBe('profile-cloud-frontier');
    expect(result.decision.selectedProviderId).toBe('provider-openai-frontier');

    // Routing decision shape
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.resolvedAt).toBeInstanceOf(Date);
  });

  it('rationale explains cloud escalation reasoning', () => {
    const request: RoutingRequest = {
      application: 'thingstead',
      process: 'risk-analysis',
      step: 'critique',
      taskType: TaskType.CRITIQUE,
      loadTier: LoadTier.COMPLEX,
      decisionPosture: DecisionPosture.STRICT,
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
      allProfiles: [localWorkingProfile, cloudFrontierProfile],
      allTactics: [complexReasoningTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Rationale describes escalation
    expect(result.rationale.policyMatchSummary).toContain('Escalation: true');
    expect(result.rationale.selectedProfileReason).toContain('Cloud Frontier Reasoner');
    expect(result.rationale.selectedProviderReason).toContain('provider-openai-frontier');

    // Rationale has all required fields
    expect(result.rationale.id).toBeTruthy();
    expect(result.rationale.executionFamilyKey).toBeTruthy();
    expect(result.rationale.eligibleProfileCount).toBeGreaterThanOrEqual(1);
    expect(result.rationale.eligibleTacticCount).toBeGreaterThanOrEqual(1);
    expect(result.rationale.constraintsSummary).toBeTruthy();
  });

  it('selects appropriate cognitive grade for frontier model', () => {
    const request: RoutingRequest = {
      application: 'thingstead',
      process: 'risk-analysis',
      step: 'deep-analysis',
      taskType: TaskType.PLANNING,
      loadTier: LoadTier.COMPLEX,
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
      allProfiles: [localWorkingProfile, cloudFrontierProfile],
      allTactics: [complexReasoningTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // The selected profile must meet the strong cognitive grade requirement
    expect(result.decision.selectedModelProfileId).toBe('profile-cloud-frontier');

    // Rationale confirms the cognitive grade context
    expect(result.rationale.selectedProfileReason).toContain(CognitiveGrade.STRONG);
    expect(result.rationale.policyMatchSummary).toContain('Cost: low');
  });

  it('execution result shape includes all required fields', () => {
    const request: RoutingRequest = {
      application: 'thingstead',
      process: 'risk-analysis',
      step: 'final-review',
      taskType: TaskType.ANALYSIS,
      loadTier: LoadTier.COMPLEX,
      decisionPosture: DecisionPosture.EVIDENTIARY,
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
      allProfiles: [cloudFrontierProfile],
      allTactics: [complexReasoningTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Decision shape
    expect(result.decision).toHaveProperty('id');
    expect(result.decision).toHaveProperty('selectedModelProfileId');
    expect(result.decision).toHaveProperty('selectedTacticProfileId');
    expect(result.decision).toHaveProperty('selectedProviderId');
    expect(result.decision).toHaveProperty('fallbackChain');
    expect(result.decision).toHaveProperty('rationaleId');
    expect(result.decision).toHaveProperty('rationaleSummary');
    expect(result.decision).toHaveProperty('resolvedAt');

    // Rationale shape
    expect(result.rationale).toHaveProperty('id');
    expect(result.rationale).toHaveProperty('routingDecisionId');
    expect(result.rationale).toHaveProperty('executionFamilyKey');
    expect(result.rationale).toHaveProperty('selectedProfileReason');
    expect(result.rationale).toHaveProperty('selectedTacticReason');
    expect(result.rationale).toHaveProperty('selectedProviderReason');
    expect(result.rationale).toHaveProperty('policyMatchSummary');
    expect(result.rationale).toHaveProperty('eligibleProfileCount');
    expect(result.rationale).toHaveProperty('eligibleTacticCount');
    expect(result.rationale).toHaveProperty('constraintsSummary');
    expect(result.rationale).toHaveProperty('createdAt');

    // Cross-reference
    expect(result.decision.rationaleId).toBe(result.rationale.id);
  });
});
