import type {
  IntentEnvelope,
  TriageDecision,
  TriageError,
  ModelProfile,
  TacticProfile,
} from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { randomUUID } from 'node:crypto';

import { IntentEnvelopeValidator } from './IntentEnvelopeValidator.js';
import { IntentTranslator } from './IntentTranslator.js';
import { SensitivityPolicyResolver } from './SensitivityPolicyResolver.js';
import { CandidateEvaluator } from './CandidateEvaluator.js';
import { TriageRanker } from './TriageRanker.js';

export interface TriagePipelineDeps {
  allProfiles: ModelProfile[];
  allTactics: TacticProfile[];
  profileProviderMap: Map<string, string>;
  effectivePolicy: EffectivePolicy;
}

export type TriageResult =
  | { ok: true; decision: TriageDecision }
  | { ok: false; error: TriageError };

export class TriagePipeline {
  private readonly validator = new IntentEnvelopeValidator();
  private readonly translator = new IntentTranslator();
  private readonly sensitivityResolver = new SensitivityPolicyResolver();
  private readonly candidateEvaluator = new CandidateEvaluator();
  private readonly ranker = new TriageRanker();

  triage(envelope: IntentEnvelope, deps: TriagePipelineDeps): TriageResult {
    // Step 1: Validate intent envelope
    const validation = this.validator.validate(envelope);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }

    // Step 2: Resolve sensitivity → trust zones
    const sensitivityResult = this.sensitivityResolver.resolve(envelope.sensitivity);

    // Step 3: Translate intent → routing request (for existing pipeline compatibility)
    const routingRequest = this.translator.translate(envelope);

    // Step 4: Effective policy is pre-computed by caller (reuses PolicyMergeResolver)
    const { allProfiles, profileProviderMap, effectivePolicy } = deps;

    // Step 5: Evaluate all candidates with rejection reasons
    const candidateEvaluations = this.candidateEvaluator.evaluate(
      allProfiles,
      effectivePolicy,
      routingRequest,
      sensitivityResult,
      envelope.contextSizeEstimate,
      envelope.latencyTargetMs,
    );

    // Enrich evaluations with provider IDs
    for (const candidate of candidateEvaluations) {
      candidate.providerId = profileProviderMap.get(candidate.modelProfileId) ?? '';
    }

    // Step 6: Rank eligible candidates
    const ranked = this.ranker.rank(candidateEvaluations, allProfiles, profileProviderMap);

    // Step 7: Select primary + build fallback chain
    if (ranked.length === 0) {
      const rejectionSummary = candidateEvaluations
        .filter((c) => !c.eligible)
        .map((c) => `${c.modelProfileId}: ${c.rejectionReason}`)
        .join('; ');

      return {
        ok: false,
        error: {
          error: 'NO_ELIGIBLE_PROVIDER',
          reason: `No eligible provider after triage. ${rejectionSummary}`,
          details: candidateEvaluations
            .filter((c) => !c.eligible)
            .map((c) => `${c.modelProfileId}: ${c.rejectionReason}`),
        },
      };
    }

    const primary = ranked[0];
    const fallbackChain = ranked.slice(1).map((r) => r.profileId);

    // Step 8: Emit triage decision
    const decision: TriageDecision = {
      triageId: randomUUID(),
      intentId: envelope.intentId,
      classification: {
        taskClass: envelope.taskClass,
        modality: envelope.modality,
        sensitivity: envelope.sensitivity,
        qualityTier: envelope.qualityTier,
      },
      policyEvaluation: {
        appliedRules: this.collectAppliedRules(effectivePolicy),
        allowedTrustZones: sensitivityResult.allowedTrustZones,
        externalPermitted: sensitivityResult.externalPermitted,
      },
      candidateProviders: candidateEvaluations,
      selectedProvider: {
        providerId: primary.providerId,
        modelProfileId: primary.profileId,
        selectionReason: `Rank ${primary.rank}: minimum sufficient intelligence (lowest cost eligible)`,
      },
      fallbackChain,
      timestamp: new Date().toISOString(),
    };

    return { ok: true, decision };
  }

  private collectAppliedRules(policy: EffectivePolicy): string[] {
    const rules: string[] = [];
    if (policy.privacy === 'local_only') rules.push('privacy:local_only');
    if (policy.privacy === 'cloud_preferred') rules.push('privacy:cloud_preferred');
    if (policy.forceEscalation) rules.push('force_escalation');
    if (policy.structuredOutputRequired) rules.push('structured_output_required');
    if (policy.traceabilityRequired) rules.push('traceability_required');
    if (policy.blockedModelProfileIds.length > 0) rules.push(`blocked_profiles:${policy.blockedModelProfileIds.length}`);
    if (policy.allowedModelProfileIds) rules.push(`allowlist:${policy.allowedModelProfileIds.length}_profiles`);
    if (policy.maxLatencyMs !== null) rules.push(`max_latency:${policy.maxLatencyMs}ms`);
    return rules;
  }
}
