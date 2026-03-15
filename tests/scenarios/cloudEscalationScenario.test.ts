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
  vendor: ProviderVendor.OLLAMA,
  modelId: 'test-model',
  contextWindow: 32768,
  maxTokens: 4096,
  costPer1kInput: 0,
  costPer1kOutput: 0,
  supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
  minimumCognitiveGrade: CognitiveGrade.STANDARD,
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
  vendor: ProviderVendor.OPENAI,
  modelId: 'gpt-4',
  contextWindow: 128000,
  maxTokens: 8192,
  costPer1kInput: 0.03,
  costPer1kOutput: 0.06,
  supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.CRITIQUE, TaskType.PLANNING, TaskType.DECISION_SUPPORT],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
  minimumCognitiveGrade: CognitiveGrade.ENHANCED,
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
  systemPromptTemplate: 'You are a helpful assistant.',
  maxRetries: 2,
  temperature: 0.7,
  topP: 0.9,
  supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.CRITIQUE, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
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
  systemPromptTemplate: 'You are a helpful assistant.',
  maxRetries: 2,
  temperature: 0.7,
  topP: 0.9,
  supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.CRITIQUE, TaskType.PLANNING],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
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
      taskType: TaskType.ANALYTICAL,
      loadTier: LoadTier.HIGH_THROUGHPUT,
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
      loadTier: LoadTier.HIGH_THROUGHPUT,
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
      loadTier: LoadTier.HIGH_THROUGHPUT,
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
      allProfiles: [localWorkingProfile, cloudFrontierProfile],
      allTactics: [complexReasoningTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeEscalationPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // The selected profile must meet the strong cognitive grade requirement
    expect(result.decision.selectedModelProfileId).toBe('profile-cloud-frontier');

    // Rationale confirms the cognitive grade context
    expect(result.rationale.selectedProfileReason).toContain(CognitiveGrade.ENHANCED);
    expect(result.rationale.policyMatchSummary).toContain('Cost: low');
  });

  it('execution result shape includes all required fields', () => {
    const request: RoutingRequest = {
      application: 'thingstead',
      process: 'risk-analysis',
      step: 'final-review',
      taskType: TaskType.ANALYTICAL,
      loadTier: LoadTier.HIGH_THROUGHPUT,
      decisionPosture: DecisionPosture.EVIDENTIARY,
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
