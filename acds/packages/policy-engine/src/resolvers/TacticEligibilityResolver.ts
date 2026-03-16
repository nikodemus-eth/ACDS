import type { TacticProfile } from '@acds/core-types';
import type { EffectivePolicy } from './PolicyMergeResolver.js';
import type { RoutingRequest } from '@acds/core-types';

export class TacticEligibilityResolver {
  resolve(
    tactics: TacticProfile[],
    policy: EffectivePolicy,
    request: RoutingRequest
  ): TacticProfile[] {
    return tactics.filter((tactic) => {
      if (!tactic.enabled) return false;
      if (policy.allowedTacticProfileIds && !policy.allowedTacticProfileIds.includes(tactic.id)) return false;
      if (!tactic.supportedTaskTypes.includes(request.taskType)) return false;
      if (!tactic.supportedLoadTiers.includes(request.loadTier)) return false;
      if (policy.structuredOutputRequired && !tactic.requiresStructuredOutput) return false;
      return true;
    });
  }
}
