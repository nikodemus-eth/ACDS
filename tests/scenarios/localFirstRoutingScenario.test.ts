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
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SIMPLE],
  minimumCognitiveGrade: CognitiveGrade.UTILITY,
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
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION, TaskType.ANALYSIS],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE, LoadTier.COMPLEX],
  minimumCognitiveGrade: CognitiveGrade.WORKING,
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
  supportedTaskTypes: [TaskType.CLASSIFICATION, TaskType.EXTRACTION, TaskType.SUMMARIZATION],
  supportedLoadTiers: [LoadTier.SIMPLE, LoadTier.MODERATE],
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
      loadTier: LoadTier.SIMPLE,
      decisionPosture: DecisionPosture.EXPLORATORY,
      cognitiveGrade: CognitiveGrade.UTILITY,
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
      loadTier: LoadTier.SIMPLE,
      decisionPosture: DecisionPosture.EXPLORATORY,
      cognitiveGrade: CognitiveGrade.UTILITY,
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
      loadTier: LoadTier.SIMPLE,
      decisionPosture: DecisionPosture.DRAFT,
      cognitiveGrade: CognitiveGrade.UTILITY,
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
