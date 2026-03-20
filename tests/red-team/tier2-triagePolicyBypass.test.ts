/**
 * ARGUS-10 Tier 2 -- Inference Triage System Policy Bypass
 *
 * Tests that the ITS pipeline cannot be tricked into:
 * - Routing sensitive data to external providers
 * - Bypassing trust zone restrictions via crafted envelopes
 * - Escalating quality tier to circumvent cost controls
 * - Exploiting fallback chains to reach blocked providers
 * - Circumventing validation through edge-case inputs
 *
 * All tests use real TriagePipeline, real CandidateEvaluator, real data.
 * Zero mocks, stubs, or fakes.
 */

import { describe, it, expect } from 'vitest';
import { TriagePipeline } from '@acds/routing-engine';
import type { TriagePipelineDeps } from '@acds/routing-engine';
import {
  TaskType, LoadTier, CognitiveGrade, ProviderVendor,
  Modality, Sensitivity, QualityTier, ContextSize, TrustZone,
} from '@acds/core-types';
import type { IntentEnvelope, ModelProfile, TacticProfile } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

const now = new Date();

function makeEnvelope(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return {
    intentId: 'red-team-intent',
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

function makePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
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
    ...overrides,
  };
}

function makeDeps(overrides: Partial<TriagePipelineDeps> = {}): TriagePipelineDeps {
  return {
    allProfiles: [makeProfile('local-1')],
    allTactics: [makeTactic('default')],
    profileProviderMap: new Map([['local-1', 'ollama-provider']]),
    effectivePolicy: makePolicy(),
    ...overrides,
  };
}

describe('ARGUS-10 Tier 2: ITS Policy Bypass', () => {
  const pipeline = new TriagePipeline();

  // ── Trust Zone Bypass Attempts ──────────────────────────────────────

  describe('trust zone enforcement', () => {

    it('blocks external providers for CONFIDENTIAL data even when externalAllowed is true', () => {
      // Adversary: set sensitivity=confidential but externalAllowed=true in constraints
      const deps = makeDeps({
        allProfiles: [
          makeProfile('cloud-provider', { localOnly: false, cloudAllowed: true }),
        ],
        profileProviderMap: new Map([['cloud-provider', 'cloud-prov']]),
      });
      const result = pipeline.triage(
        makeEnvelope({
          sensitivity: Sensitivity.CONFIDENTIAL,
          executionConstraints: { localOnly: false, externalAllowed: true, offlineRequired: false },
        }),
        deps,
      );
      // Sensitivity CONFIDENTIAL restricts to local trust zone.
      // Even though externalAllowed=true, the SensitivityPolicyResolver
      // maps CONFIDENTIAL → [LOCAL] only.
      // But the IntentTranslator respects externalAllowed flag for privacy mapping.
      // The CandidateEvaluator checks trust zones from sensitivity, not from privacy.
      // So the cloud provider should be rejected via trust_zone_violation.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.error).toBe('NO_ELIGIBLE_PROVIDER');
        expect(result.error.details![0]).toContain('trust_zone_violation');
      }
    });

    it('blocks external providers for REGULATED data regardless of constraints', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('cloud-only', { localOnly: false, cloudAllowed: true }),
        ],
        profileProviderMap: new Map([['cloud-only', 'cloud-prov']]),
      });
      const result = pipeline.triage(
        makeEnvelope({
          sensitivity: Sensitivity.REGULATED,
          executionConstraints: { localOnly: false, externalAllowed: true, offlineRequired: false },
        }),
        deps,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.error).toBe('NO_ELIGIBLE_PROVIDER');
      }
    });

    it('blocks external providers for RESTRICTED data', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('cloud-only', { localOnly: false, cloudAllowed: true }),
        ],
        profileProviderMap: new Map([['cloud-only', 'cloud-prov']]),
      });
      const result = pipeline.triage(
        makeEnvelope({ sensitivity: Sensitivity.RESTRICTED }),
        deps,
      );
      expect(result.ok).toBe(false);
    });

    it('allows external providers for PUBLIC data', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('cloud-ok', { localOnly: false, cloudAllowed: true }),
        ],
        profileProviderMap: new Map([['cloud-ok', 'cloud-prov']]),
      });
      const result = pipeline.triage(
        makeEnvelope({
          sensitivity: Sensitivity.PUBLIC,
          executionConstraints: { localOnly: false, externalAllowed: true, offlineRequired: false },
        }),
        deps,
      );
      expect(result.ok).toBe(true);
    });
  });

  // ── Validation Bypass Attempts ─────────────────────────────────────

  describe('envelope validation bypass', () => {

    it('rejects envelope with empty intentId', () => {
      const result = pipeline.triage(makeEnvelope({ intentId: '' }), makeDeps());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.error).toBe('INVALID_INTENT_ENVELOPE');
      }
    });

    it('rejects envelope with fabricated task class', () => {
      const result = pipeline.triage(
        makeEnvelope({ taskClass: 'sql_injection' as any }),
        makeDeps(),
      );
      expect(result.ok).toBe(false);
    });

    it('rejects envelope with fabricated sensitivity level', () => {
      const result = pipeline.triage(
        makeEnvelope({ sensitivity: 'admin_override' as any }),
        makeDeps(),
      );
      expect(result.ok).toBe(false);
    });

    it('rejects envelope with fabricated modality', () => {
      const result = pipeline.triage(
        makeEnvelope({ modality: 'backdoor' as any }),
        makeDeps(),
      );
      expect(result.ok).toBe(false);
    });

    it('rejects envelope with conflicting execution constraints', () => {
      const result = pipeline.triage(
        makeEnvelope({
          executionConstraints: { localOnly: true, externalAllowed: true, offlineRequired: false },
        }),
        makeDeps(),
      );
      expect(result.ok).toBe(false);
    });
  });

  // ── Policy Circumvention Attempts ──────────────────────────────────

  describe('policy enforcement', () => {

    it('respects blocked profile IDs — cannot route to blocked profiles', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('blocked-profile'),
          makeProfile('allowed-profile'),
        ],
        profileProviderMap: new Map([
          ['blocked-profile', 'prov-1'],
          ['allowed-profile', 'prov-2'],
        ]),
        effectivePolicy: makePolicy({
          blockedModelProfileIds: ['blocked-profile'],
        }),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('allowed-profile');
        const blocked = result.decision.candidateProviders.find(
          (c) => c.modelProfileId === 'blocked-profile',
        );
        expect(blocked!.eligible).toBe(false);
        expect(blocked!.rejectionReason).toBe('policy_blocked');
      }
    });

    it('respects allowlist — only allowlisted profiles are eligible', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('allowed'),
          makeProfile('not-on-list'),
        ],
        profileProviderMap: new Map([
          ['allowed', 'prov-1'],
          ['not-on-list', 'prov-2'],
        ]),
        effectivePolicy: makePolicy({
          allowedModelProfileIds: ['allowed'],
        }),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('allowed');
        const excluded = result.decision.candidateProviders.find(
          (c) => c.modelProfileId === 'not-on-list',
        );
        expect(excluded!.rejectionReason).toBe('policy_allowlist_excluded');
      }
    });

    it('disabled profiles never appear as eligible', () => {
      const deps = makeDeps({
        allProfiles: [makeProfile('disabled', { enabled: false })],
        profileProviderMap: new Map([['disabled', 'prov-1']]),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.details![0]).toContain('disabled');
      }
    });
  });

  // ── Fallback Chain Manipulation ────────────────────────────────────

  describe('fallback chain integrity', () => {

    it('fallback chain never contains the primary selection', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('primary', { costPer1kInput: 0, costPer1kOutput: 0 }),
          makeProfile('fallback', { costPer1kInput: 0.01, costPer1kOutput: 0.01 }),
        ],
        profileProviderMap: new Map([
          ['primary', 'prov-1'],
          ['fallback', 'prov-2'],
        ]),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('primary');
        expect(result.decision.fallbackChain).not.toContain('primary');
        expect(result.decision.fallbackChain).toEqual(['fallback']);
      }
    });

    it('fallback chain never contains ineligible profiles', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('eligible'),
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
        expect(result.decision.fallbackChain).not.toContain('disabled');
      }
    });

    it('fallback chain is empty when only one eligible provider exists', () => {
      const deps = makeDeps({
        allProfiles: [makeProfile('solo')],
        profileProviderMap: new Map([['solo', 'prov-1']]),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.fallbackChain).toEqual([]);
      }
    });
  });

  // ── Minimum Sufficient Intelligence Enforcement ────────────────────

  describe('cost escalation prevention', () => {

    it('always selects cheapest eligible model, not most expensive', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('expensive', { costPer1kInput: 0.10, costPer1kOutput: 0.30 }),
          makeProfile('cheap', { costPer1kInput: 0, costPer1kOutput: 0 }),
          makeProfile('medium', { costPer1kInput: 0.01, costPer1kOutput: 0.03 }),
        ],
        profileProviderMap: new Map([
          ['expensive', 'prov-1'],
          ['cheap', 'prov-2'],
          ['medium', 'prov-3'],
        ]),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('cheap');
      }
    });

    it('quality tier CRITICAL does not bypass cost ranking', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('expensive-good', { costPer1kInput: 0.50, costPer1kOutput: 0.50 }),
          makeProfile('cheap-good', { costPer1kInput: 0, costPer1kOutput: 0 }),
        ],
        profileProviderMap: new Map([
          ['expensive-good', 'prov-1'],
          ['cheap-good', 'prov-2'],
        ]),
      });
      const result = pipeline.triage(
        makeEnvelope({ qualityTier: QualityTier.CRITICAL }),
        deps,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.selectedProvider!.modelProfileId).toBe('cheap-good');
      }
    });
  });

  // ── Audit Trail Integrity ──────────────────────────────────────────

  describe('audit trail completeness', () => {

    it('every triage decision has a unique triageId', () => {
      const deps = makeDeps();
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = pipeline.triage(makeEnvelope({ intentId: `intent-${i}` }), deps);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(ids.has(result.decision.triageId)).toBe(false);
          ids.add(result.decision.triageId);
        }
      }
      expect(ids.size).toBe(20);
    });

    it('classification reflects the actual envelope, not defaults', () => {
      const result = pipeline.triage(
        makeEnvelope({
          taskClass: TaskType.CODING,
          modality: Modality.MULTIMODAL,
          sensitivity: Sensitivity.RESTRICTED,
          qualityTier: QualityTier.HIGH,
        }),
        makeDeps(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.classification.taskClass).toBe(TaskType.CODING);
        expect(result.decision.classification.modality).toBe(Modality.MULTIMODAL);
        expect(result.decision.classification.sensitivity).toBe(Sensitivity.RESTRICTED);
        expect(result.decision.classification.qualityTier).toBe(QualityTier.HIGH);
      }
    });

    it('candidate evaluation includes ALL profiles, not just eligible ones', () => {
      const deps = makeDeps({
        allProfiles: [
          makeProfile('eligible'),
          makeProfile('disabled', { enabled: false }),
          makeProfile('wrong-task', { supportedTaskTypes: [TaskType.CODING] }),
        ],
        profileProviderMap: new Map([
          ['eligible', 'prov-1'],
          ['disabled', 'prov-2'],
          ['wrong-task', 'prov-3'],
        ]),
      });
      const result = pipeline.triage(makeEnvelope(), deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.decision.candidateProviders).toHaveLength(3);
      }
    });
  });

  // ── Determinism ────────────────────────────────────────────────────

  describe('determinism guarantee', () => {

    it('100 identical inputs produce 100 identical selections', () => {
      const envelope = makeEnvelope();
      const deps = makeDeps({
        allProfiles: [
          makeProfile('a', { costPer1kInput: 0, costPer1kOutput: 0 }),
          makeProfile('b', { costPer1kInput: 0.01, costPer1kOutput: 0.01 }),
          makeProfile('c', { costPer1kInput: 0.05, costPer1kOutput: 0.05 }),
        ],
        profileProviderMap: new Map([['a', 'p1'], ['b', 'p2'], ['c', 'p3']]),
      });

      const selections: string[] = [];
      for (let i = 0; i < 100; i++) {
        const result = pipeline.triage(envelope, deps);
        expect(result.ok).toBe(true);
        if (result.ok) {
          selections.push(result.decision.selectedProvider!.modelProfileId);
        }
      }

      const uniqueSelections = new Set(selections);
      expect(uniqueSelections.size).toBe(1);
      expect(selections[0]).toBe('a');
    });
  });
});
