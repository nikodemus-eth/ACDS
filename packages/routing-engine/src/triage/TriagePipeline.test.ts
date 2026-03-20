import { describe, it, expect } from 'vitest';
import { TriagePipeline } from './TriagePipeline.js';
import type { TriagePipelineDeps } from './TriagePipeline.js';
import {
  TaskType, LoadTier, CognitiveGrade, ProviderVendor,
  Modality, Sensitivity, QualityTier, ContextSize, TrustZone,
} from '@acds/core-types';
import type { IntentEnvelope, ModelProfile, TacticProfile } from '@acds/core-types';

const now = new Date();

function makeEnvelope(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return {
    intentId: 'test-intent-1',
    taskClass: TaskType.ANALYTICAL,
    modality: Modality.TEXT_TO_TEXT,
    sensitivity: Sensitivity.INTERNAL,
    qualityTier: QualityTier.MEDIUM,
    latencyTargetMs: 30000,
    costSensitivity: 'medium',
    executionConstraints: {
      localOnly: true,
      externalAllowed: false,
      offlineRequired: false,
    },
    contextSizeEstimate: ContextSize.SMALL,
    requiresSchemaValidation: false,
    origin: 'process_swarm',
    timestamp: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: '',
    vendor: ProviderVendor.OLLAMA,
    modelId: `model_${id}`,
    supportedTaskTypes: Object.values(TaskType),
    supportedLoadTiers: Object.values(LoadTier),
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    contextWindow: 32768,
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    localOnly: true,
    cloudAllowed: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTactic(id: string): TacticProfile {
  return {
    id,
    name: `tactic_${id}`,
    description: '',
    executionMethod: 'single_call',
    systemPromptTemplate: '',
    outputSchema: undefined,
    maxRetries: 0,
    temperature: 0,
    topP: 1,
    supportedTaskTypes: Object.values(TaskType),
    supportedLoadTiers: Object.values(LoadTier),
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDeps(overrides: Partial<TriagePipelineDeps> = {}): TriagePipelineDeps {
  const profiles = [
    makeProfile('local-cheap', { costPer1kInput: 0, costPer1kOutput: 0 }),
    makeProfile('local-expensive', { costPer1kInput: 0.01, costPer1kOutput: 0.03 }),
  ];
  return {
    allProfiles: profiles,
    allTactics: [makeTactic('default')],
    profileProviderMap: new Map([
      ['local-cheap', 'ollama-provider'],
      ['local-expensive', 'ollama-provider'],
    ]),
    effectivePolicy: {
      allowedVendors: [ProviderVendor.OLLAMA],
      blockedVendors: [],
      privacy: 'local_only',
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
    },
    ...overrides,
  };
}

describe('TriagePipeline', () => {
  const pipeline = new TriagePipeline();

  it('selects the cheapest eligible provider (minimum sufficient intelligence)', () => {
    const result = pipeline.triage(makeEnvelope(), makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.selectedProvider!.modelProfileId).toBe('local-cheap');
      expect(result.decision.selectedProvider!.selectionReason).toContain('minimum sufficient intelligence');
    }
  });

  it('includes all candidates with rejection reasons', () => {
    const deps = makeDeps({
      allProfiles: [
        makeProfile('eligible', { costPer1kInput: 0, costPer1kOutput: 0 }),
        makeProfile('disabled', { enabled: false }),
      ],
      profileProviderMap: new Map([
        ['eligible', 'prov-1'],
        ['disabled', 'prov-2'],
      ]),
    });
    const result = pipeline.triage(makeEnvelope(), deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.candidateProviders).toHaveLength(2);
      const disabled = result.decision.candidateProviders.find((c) => c.modelProfileId === 'disabled');
      expect(disabled?.eligible).toBe(false);
      expect(disabled?.rejectionReason).toBe('disabled');
    }
  });

  it('returns NO_ELIGIBLE_PROVIDER when all profiles are rejected', () => {
    const deps = makeDeps({
      allProfiles: [makeProfile('blocked', { enabled: false })],
      profileProviderMap: new Map([['blocked', 'prov-1']]),
    });
    const result = pipeline.triage(makeEnvelope(), deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('NO_ELIGIBLE_PROVIDER');
    }
  });

  it('returns INVALID_INTENT_ENVELOPE for bad input', () => {
    const result = pipeline.triage(makeEnvelope({ intentId: '' }), makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('INVALID_INTENT_ENVELOPE');
    }
  });

  it('builds fallback chain from remaining ranked candidates', () => {
    const result = pipeline.triage(makeEnvelope(), makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.fallbackChain).toEqual(['local-expensive']);
    }
  });

  it('populates classification from envelope', () => {
    const result = pipeline.triage(makeEnvelope(), makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.classification).toEqual({
        taskClass: TaskType.ANALYTICAL,
        modality: Modality.TEXT_TO_TEXT,
        sensitivity: Sensitivity.INTERNAL,
        qualityTier: QualityTier.MEDIUM,
      });
    }
  });

  it('populates policy evaluation with trust zones', () => {
    const result = pipeline.triage(makeEnvelope({ sensitivity: Sensitivity.CONFIDENTIAL }), makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.policyEvaluation.allowedTrustZones).toEqual([TrustZone.LOCAL]);
      expect(result.decision.policyEvaluation.externalPermitted).toBe(false);
    }
  });

  it('rejects cloud profiles when sensitivity is confidential', () => {
    const deps = makeDeps({
      allProfiles: [
        makeProfile('cloud-only', { localOnly: false, cloudAllowed: true }),
      ],
      profileProviderMap: new Map([['cloud-only', 'cloud-prov']]),
    });
    const result = pipeline.triage(
      makeEnvelope({ sensitivity: Sensitivity.CONFIDENTIAL }),
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('NO_ELIGIBLE_PROVIDER');
      expect(result.error.details![0]).toContain('trust_zone_violation');
    }
  });

  it('collects all policy rules in applied rules', () => {
    const deps = makeDeps({
      allProfiles: [makeProfile('p1')],
      profileProviderMap: new Map([['p1', 'prov-1']]),
      effectivePolicy: {
        allowedVendors: [ProviderVendor.OLLAMA],
        blockedVendors: [],
        privacy: 'cloud_preferred',
        costSensitivity: 'medium',
        structuredOutputRequired: true,
        traceabilityRequired: true,
        maxLatencyMs: 5000,
        allowedModelProfileIds: ['p1'],
        blockedModelProfileIds: ['blocked-1'],
        allowedTacticProfileIds: null,
        defaultModelProfileId: null,
        defaultTacticProfileId: null,
        forceEscalation: true,
      },
    });
    const result = pipeline.triage(
      makeEnvelope({ sensitivity: Sensitivity.PUBLIC }),
      deps,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rules = result.decision.policyEvaluation.appliedRules;
      expect(rules).toContain('privacy:cloud_preferred');
      expect(rules).toContain('force_escalation');
      expect(rules).toContain('structured_output_required');
      expect(rules).toContain('traceability_required');
      expect(rules).toContain('blocked_profiles:1');
      expect(rules).toContain('allowlist:1_profiles');
      expect(rules).toContain('max_latency:5000ms');
    }
  });

  it('enriches candidate evaluations with provider IDs including missing mappings', () => {
    const deps = makeDeps({
      allProfiles: [makeProfile('mapped'), makeProfile('unmapped')],
      profileProviderMap: new Map([['mapped', 'prov-1']]),
    });
    const result = pipeline.triage(makeEnvelope(), deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const mapped = result.decision.candidateProviders.find((c) => c.modelProfileId === 'mapped');
      const unmapped = result.decision.candidateProviders.find((c) => c.modelProfileId === 'unmapped');
      expect(mapped!.providerId).toBe('prov-1');
      expect(unmapped!.providerId).toBe('');
    }
  });

  it('is deterministic — same input produces same output structure', () => {
    const envelope = makeEnvelope();
    const deps = makeDeps();
    const results = Array.from({ length: 10 }, () => pipeline.triage(envelope, deps));

    for (const result of results) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('local-cheap');
        expect(result.decision.fallbackChain).toEqual(['local-expensive']);
        expect(result.decision.candidateProviders).toHaveLength(2);
      }
    }
  });
});
