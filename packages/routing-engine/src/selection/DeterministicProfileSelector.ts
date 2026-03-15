import type { ModelProfile } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

export class DeterministicProfileSelector {
  select(eligible: ModelProfile[], policy: EffectivePolicy): ModelProfile | null {
    if (eligible.length === 0) return null;

    // Prefer the policy default if eligible
    if (policy.defaultModelProfileId) {
      const defaultProfile = eligible.find((p) => p.id === policy.defaultModelProfileId);
      if (defaultProfile) return defaultProfile;
    }

    // Prefer local-only profiles when privacy is local_only
    if (policy.privacy === 'local_only') {
      const localProfile = eligible.find((p) => p.localOnly);
      if (localProfile) return localProfile;
    }

    // Return the first eligible profile (stable deterministic order)
    return eligible[0];
  }
}
