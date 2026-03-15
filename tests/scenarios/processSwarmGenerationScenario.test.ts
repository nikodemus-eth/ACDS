// ---------------------------------------------------------------------------
// Scenario Test – Process Swarm Creative Generation
// ---------------------------------------------------------------------------
// Simulates: text generation workflow -> cloud model routing.
// Verifies:  routing prefers cloud_frontier_creative,
//            tactic is appropriate for creative generation.
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
const cloudCreativeProfile: ModelProfile = {
  id: 'profile-cloud-creative',
  name: 'Cloud Frontier Creative',
  description: 'Cloud frontier model optimized for creative text generation',
  supportedTaskTypes: [TaskType.CREATIVE, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  minimumCognitiveGrade: CognitiveGrade.STRONG,
  localOnly: false,
  cloudAllowed: true,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const localDraftProfile: ModelProfile = {
  id: 'profile-local-draft',
  name: 'Local Draft Writer',
  description: 'Local model for quick drafts',
  supportedTaskTypes: [TaskType.CREATIVE, TaskType.TRANSFORMATION],
  supportedLoadTiers: [LoadTier.SIMPLE],
  minimumCognitiveGrade: CognitiveGrade.UTILITY,
  localOnly: true,
  cloudAllowed: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const creativeGenerationTactic: TacticProfile = {
  id: 'tactic-creative-gen',
  name: 'Creative Generation',
  description: 'Multi-pass creative generation tactic',
  executionMethod: 'creative_generation',
  supportedTaskTypes: [TaskType.CREATIVE],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  multiStage: true,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const singlePromptTactic: TacticProfile = {
  id: 'tactic-single',
  name: 'Single Prompt',
  description: 'Simple single prompt tactic',
  executionMethod: 'single_prompt',
  supportedTaskTypes: [TaskType.CREATIVE, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  multiStage: false,
  requiresStructuredOutput: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const profileProviderMap = new Map<string, string>([
  ['profile-cloud-creative', 'provider-openai-creative'],
  ['profile-local-draft', 'provider-ollama-local'],
]);

function makeCloudPreferredPolicy(): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA, ProviderVendor.OPENAI, ProviderVendor.GEMINI],
    blockedVendors: [],
    privacy: 'cloud_preferred',
    costSensitivity: 'low',
    structuredOutputRequired: false,
    traceabilityRequired: false,
    maxLatencyMs: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: 'profile-cloud-creative',
    defaultTacticProfileId: null,
    forceEscalation: false,
  };
}

// ===========================================================================
// Scenario Tests
// ===========================================================================

describe('Scenario: Process Swarm Creative Generation', () => {
  const resolver = new DispatchResolver();

  it('routes creative generation to cloud frontier model', () => {
    const request: RoutingRequest = {
      application: 'processSwarm',
      process: 'content-generation',
      step: 'draft',
      taskType: TaskType.CREATIVE,
      loadTier: LoadTier.MODERATE,
      decisionPosture: DecisionPosture.DRAFT,
      cognitiveGrade: CognitiveGrade.STRONG,
      constraints: {
        privacy: 'cloud_preferred',
        maxLatencyMs: null,
        costSensitivity: 'low',
        structuredOutputRequired: false,
        traceabilityRequired: false,
      },
    };

    const deps: DispatchResolverDeps = {
      allProfiles: [cloudCreativeProfile, localDraftProfile],
      allTactics: [creativeGenerationTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeCloudPreferredPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Should route to the cloud creative profile (policy default + cloud_preferred)
    expect(result.decision.selectedModelProfileId).toBe('profile-cloud-creative');
    expect(result.decision.selectedProviderId).toBe('provider-openai-creative');

    // Rationale reflects the cloud creative selection
    expect(result.rationale.selectedProfileReason).toContain('Cloud Frontier Creative');
    expect(result.rationale.policyMatchSummary).toContain('cloud_preferred');

    // Decision shape is valid
    expect(result.decision.id).toBeTruthy();
    expect(result.decision.resolvedAt).toBeInstanceOf(Date);
  });

  it('selects an appropriate tactic for creative generation', () => {
    const request: RoutingRequest = {
      application: 'processSwarm',
      process: 'content-generation',
      step: 'draft',
      taskType: TaskType.CREATIVE,
      loadTier: LoadTier.MODERATE,
      decisionPosture: DecisionPosture.DRAFT,
      cognitiveGrade: CognitiveGrade.STRONG,
      constraints: {
        privacy: 'cloud_preferred',
        maxLatencyMs: null,
        costSensitivity: 'low',
        structuredOutputRequired: false,
        traceabilityRequired: false,
      },
    };

    const deps: DispatchResolverDeps = {
      allProfiles: [cloudCreativeProfile, localDraftProfile],
      allTactics: [creativeGenerationTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeCloudPreferredPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Tactic should be one of the creative-supporting tactics
    expect(
      result.decision.selectedTacticProfileId === 'tactic-creative-gen' ||
      result.decision.selectedTacticProfileId === 'tactic-single',
    ).toBe(true);

    // Rationale describes the tactic choice
    expect(result.rationale.selectedTacticReason).toBeTruthy();
    expect(result.rationale.eligibleTacticCount).toBeGreaterThan(0);
  });

  it('generates rationale explaining creative routing', () => {
    const request: RoutingRequest = {
      application: 'processSwarm',
      process: 'content-generation',
      step: 'review',
      taskType: TaskType.CREATIVE,
      loadTier: LoadTier.COMPLEX,
      decisionPosture: DecisionPosture.REVIEW,
      cognitiveGrade: CognitiveGrade.STRONG,
      constraints: {
        privacy: 'cloud_preferred',
        maxLatencyMs: null,
        costSensitivity: 'low',
        structuredOutputRequired: false,
        traceabilityRequired: false,
      },
    };

    const deps: DispatchResolverDeps = {
      allProfiles: [cloudCreativeProfile],
      allTactics: [creativeGenerationTactic, singlePromptTactic],
      profileProviderMap,
      effectivePolicy: makeCloudPreferredPolicy(),
    };

    const result = resolver.resolve(request, deps);

    // Rationale should have all required fields
    expect(result.rationale.id).toBeTruthy();
    expect(result.rationale.executionFamilyKey).toContain('processswarm');
    expect(result.rationale.selectedProfileReason).toBeTruthy();
    expect(result.rationale.selectedTacticReason).toBeTruthy();
    expect(result.rationale.selectedProviderReason).toBeTruthy();
    expect(result.rationale.constraintsSummary).toBeTruthy();
    expect(result.rationale.createdAt).toBeInstanceOf(Date);
  });
});
