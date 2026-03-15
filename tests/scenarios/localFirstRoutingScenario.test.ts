// ---------------------------------------------------------------------------
// Scenario Test – Local-First Routing
// ---------------------------------------------------------------------------
// Simulates: simple/low-load task -> local model.
// Verifies:  routing selects local provider, no cloud escalation.
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
const localUtilityProfile: ModelProfile = {
  id: 'profile-local-utility',
  name: 'Local Utility Model',
  description: 'Fast local model for simple utility tasks',
  vendor: ProviderVendor.OLLAMA,
  modelId: 'test-model',
  contextWindow: 32768,
  maxTokens: 4096,
  costPer1kInput: 0,
  costPer1kOutput: 0,
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT],
  minimumCognitiveGrade: CognitiveGrade.BASIC,
  localOnly: true,
  cloudAllowed: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const cloudGeneralProfile: ModelProfile = {
  id: 'profile-cloud-general',
  name: 'Cloud General Model',
  description: 'General-purpose cloud model',
  vendor: ProviderVendor.OPENAI,
  modelId: 'gpt-4',
  contextWindow: 128000,
  maxTokens: 8192,
  costPer1kInput: 0.03,
  costPer1kOutput: 0.06,
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION, TaskType.ANALYTICAL],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH, LoadTier.HIGH_THROUGHPUT],
  minimumCognitiveGrade: CognitiveGrade.STANDARD,
  localOnly: false,
  cloudAllowed: true,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const simpleTactic: TacticProfile = {
  id: 'tactic-simple-extract',
  name: 'Simple Extraction',
  description: 'Straightforward extraction tactic',
  executionMethod: 'single_prompt',
  systemPromptTemplate: 'You are a helpful assistant.',
  maxRetries: 2,
  temperature: 0.7,
  topP: 0.9,
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
  multiStage: false,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const profileProviderMap = new Map<string, string>([
  ['profile-local-utility', 'provider-ollama-local'],
  ['profile-cloud-general', 'provider-openai-general'],
]);

function makeLocalFirstPolicy(): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA],
    blockedVendors: [ProviderVendor.OPENAI, ProviderVendor.GEMINI],
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

// ===========================================================================
// Scenario Tests
// ===========================================================================

describe('Scenario: Local-First Routing for Simple Tasks', () => {
  const resolver = new DispatchResolver();

  it('routes a simple classification task to a local provider', () => {
    const request: RoutingRequest = {
      application: 'dataProcessor',
      process: 'intake',
      step: 'classify',
      taskType: TaskType.CLASSIFICATION,
      loadTier: LoadTier.SINGLE_SHOT,
      decisionPosture: DecisionPosture.EXPLORATORY,
      cognitiveGrade: CognitiveGrade.BASIC,
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
      allProfiles: [localUtilityProfile, cloudGeneralProfile],
      allTactics: [simpleTactic],
      profileProviderMap,
      effectivePolicy: makeLocalFirstPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Must select local provider
    expect(result.decision.selectedModelProfileId).toBe('profile-local-utility');
    expect(result.decision.selectedProviderId).toBe('provider-ollama-local');

    // No cloud escalation
    expect(result.rationale.policyMatchSummary).toContain('local_only');
    expect(result.rationale.policyMatchSummary).toContain('Escalation: false');
  });

  it('does not include cloud models in the fallback chain under local_only policy', () => {
    const request: RoutingRequest = {
      application: 'dataProcessor',
      process: 'intake',
      step: 'extract',
      taskType: TaskType.EXTRACTION,
      loadTier: LoadTier.SINGLE_SHOT,
      decisionPosture: DecisionPosture.EXPLORATORY,
      cognitiveGrade: CognitiveGrade.BASIC,
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
      allProfiles: [localUtilityProfile, cloudGeneralProfile],
      allTactics: [simpleTactic],
      profileProviderMap,
      effectivePolicy: makeLocalFirstPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Fallback chain should not contain cloud models (they are not eligible)
    for (const entry of result.decision.fallbackChain) {
      expect(entry.providerId).not.toBe('provider-openai-general');
      expect(entry.modelProfileId).not.toBe('profile-cloud-general');
    }
  });

  it('generates rationale confirming local routing without escalation', () => {
    const request: RoutingRequest = {
      application: 'dataProcessor',
      process: 'intake',
      step: 'summarize',
      taskType: TaskType.SUMMARIZATION,
      loadTier: LoadTier.SINGLE_SHOT,
      decisionPosture: DecisionPosture.OPERATIONAL,
      cognitiveGrade: CognitiveGrade.BASIC,
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
      allProfiles: [localUtilityProfile, cloudGeneralProfile],
      allTactics: [simpleTactic],
      profileProviderMap,
      effectivePolicy: makeLocalFirstPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Rationale is complete and describes local selection
    expect(result.rationale.id).toBeTruthy();
    expect(result.rationale.selectedProfileReason).toContain('Local Utility Model');
    expect(result.rationale.selectedProviderReason).toContain('provider-ollama-local');
    expect(result.rationale.eligibleProfileCount).toBe(1); // Only local is eligible
    expect(result.rationale.createdAt).toBeInstanceOf(Date);

    // Routing decision shape is valid
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.resolvedAt).toBeInstanceOf(Date);
    expect(result.decision.rationaleId).toBe(result.rationale.id);
  });
});
