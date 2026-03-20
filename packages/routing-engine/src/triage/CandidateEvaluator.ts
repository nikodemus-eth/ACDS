import type { ModelProfile, CandidateEvaluation, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { TrustZone, ContextSize } from '@acds/core-types';
import type { SensitivityPolicyResult } from './SensitivityPolicyResolver.js';

type RejectionReason =
  | 'disabled'
  | 'policy_blocked'
  | 'policy_allowlist_excluded'
  | 'capability_mismatch'
  | 'load_tier_unsupported'
  | 'trust_zone_violation'
  | 'context_size_exceeded'
  | 'latency_exceeded';

const CONTEXT_SIZE_THRESHOLDS: Record<string, number> = {
  [ContextSize.SMALL]: 4_096,
  [ContextSize.MEDIUM]: 16_384,
  [ContextSize.LARGE]: 65_536,
};

export class CandidateEvaluator {
  evaluate(
    profiles: ModelProfile[],
    policy: EffectivePolicy,
    request: RoutingRequest,
    sensitivityResult: SensitivityPolicyResult,
    contextSizeEstimate: ContextSize,
    latencyTargetMs: number | null,
  ): CandidateEvaluation[] {
    return profiles.map((profile) => {
      const reason = this.findRejectionReason(
        profile, policy, request, sensitivityResult, contextSizeEstimate, latencyTargetMs,
      );
      return {
        providerId: '', // populated by pipeline from providerMap
        modelProfileId: profile.id,
        eligible: reason === null,
        rejectionReason: reason,
      };
    });
  }

  private findRejectionReason(
    profile: ModelProfile,
    policy: EffectivePolicy,
    request: RoutingRequest,
    sensitivityResult: SensitivityPolicyResult,
    contextSizeEstimate: ContextSize,
    latencyTargetMs: number | null,
  ): RejectionReason | null {
    if (!profile.enabled) return 'disabled';

    if (policy.blockedModelProfileIds.includes(profile.id)) return 'policy_blocked';

    if (policy.allowedModelProfileIds && !policy.allowedModelProfileIds.includes(profile.id)) {
      return 'policy_allowlist_excluded';
    }

    if (!profile.supportedTaskTypes.includes(request.taskType)) return 'capability_mismatch';

    if (!profile.supportedLoadTiers.includes(request.loadTier)) return 'load_tier_unsupported';

    if (!this.trustZonePermitted(profile, sensitivityResult)) return 'trust_zone_violation';

    const requiredContext = CONTEXT_SIZE_THRESHOLDS[contextSizeEstimate] ?? 0;
    if (requiredContext > 0 && profile.contextWindow < requiredContext) return 'context_size_exceeded';

    if (latencyTargetMs !== null && policy.maxLatencyMs !== null && policy.maxLatencyMs > latencyTargetMs) {
      // This is a policy-level latency check; per-profile latency isn't tracked on ModelProfile today
    }

    return null;
  }

  private trustZonePermitted(
    profile: ModelProfile,
    sensitivityResult: SensitivityPolicyResult,
  ): boolean {
    const profileZone = profile.localOnly ? TrustZone.LOCAL : TrustZone.EXTERNAL;
    return sensitivityResult.allowedTrustZones.includes(profileZone);
  }
}
