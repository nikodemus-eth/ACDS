import type { TacticProfile } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

export class DeterministicTacticSelector {
  select(eligible: TacticProfile[], policy: EffectivePolicy): TacticProfile | null {
    if (eligible.length === 0) return null;

    if (policy.defaultTacticProfileId) {
      const defaultTactic = eligible.find((t) => t.id === policy.defaultTacticProfileId);
      if (defaultTactic) return defaultTactic;
    }

    // Prefer single-stage tactics for simpler execution
    const singleStage = eligible.find((t) => !t.multiStage);
    if (singleStage) return singleStage;

    return eligible[0];
  }
}
