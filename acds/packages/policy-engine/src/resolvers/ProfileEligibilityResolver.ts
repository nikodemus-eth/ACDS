import type { ModelProfile } from '@acds/core-types';
import type { EffectivePolicy } from './PolicyMergeResolver.js';
import type { RoutingRequest } from '@acds/core-types';

export class ProfileEligibilityResolver {
  resolve(
    profiles: ModelProfile[],
    policy: EffectivePolicy,
    request: RoutingRequest
  ): ModelProfile[] {
    return profiles.filter((profile) => {
      if (!profile.enabled) return false;
      if (policy.blockedModelProfileIds.includes(profile.id)) return false;
      if (policy.allowedModelProfileIds && !policy.allowedModelProfileIds.includes(profile.id)) return false;
      if (!profile.supportedTaskTypes.includes(request.taskType)) return false;
      if (!profile.supportedLoadTiers.includes(request.loadTier)) return false;
      if (policy.privacy === 'local_only' && !profile.localOnly) return false;
      if (policy.privacy === 'cloud_preferred' && !profile.cloudAllowed && !profile.localOnly) return false;
      return true;
    });
  }
}
