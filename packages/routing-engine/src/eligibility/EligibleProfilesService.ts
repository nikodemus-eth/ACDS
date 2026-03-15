import type { ModelProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { ProfileEligibilityResolver } from '@acds/policy-engine';

export class EligibleProfilesService {
  private readonly resolver = new ProfileEligibilityResolver();

  computeEligible(
    allProfiles: ModelProfile[],
    policy: EffectivePolicy,
    request: RoutingRequest
  ): ModelProfile[] {
    return this.resolver.resolve(allProfiles, policy, request);
  }
}
