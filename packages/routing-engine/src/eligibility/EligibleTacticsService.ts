import type { TacticProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { TacticEligibilityResolver } from '@acds/policy-engine';

export class EligibleTacticsService {
  private readonly resolver = new TacticEligibilityResolver();

  computeEligible(
    allTactics: TacticProfile[],
    policy: EffectivePolicy,
    request: RoutingRequest
  ): TacticProfile[] {
    return this.resolver.resolve(allTactics, policy, request);
  }
}
