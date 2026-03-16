import type { RoutingDecision } from '@acds/core-types';
import type { ModelProfile, TacticProfile } from '@acds/core-types';
import type { FallbackEntry } from '@acds/core-types';
import { randomUUID } from 'node:crypto';

export class RoutingDecisionResolver {
  resolve(
    selectedProfile: ModelProfile,
    selectedTactic: TacticProfile,
    selectedProviderId: string,
    fallbackChain: FallbackEntry[],
    rationaleId: string,
    rationaleSummary: string
  ): RoutingDecision {
    return {
      id: randomUUID(),
      selectedModelProfileId: selectedProfile.id,
      selectedTacticProfileId: selectedTactic.id,
      selectedProviderId,
      fallbackChain,
      rationaleId,
      rationaleSummary,
      resolvedAt: new Date(),
    };
  }
}
