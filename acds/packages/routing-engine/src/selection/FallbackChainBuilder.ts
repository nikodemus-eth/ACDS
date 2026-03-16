import type { ModelProfile } from '@acds/core-types';
import type { FallbackEntry } from '@acds/core-types';

export class FallbackChainBuilder {
  build(
    eligible: ModelProfile[],
    selectedProfileId: string,
    selectedTacticId: string,
    providerMap: Map<string, string>
  ): FallbackEntry[] {
    const chain: FallbackEntry[] = [];
    let priority = 1;

    for (const profile of eligible) {
      if (profile.id === selectedProfileId) continue;
      const providerId = providerMap.get(profile.id);
      if (!providerId) continue;

      chain.push({
        modelProfileId: profile.id,
        tacticProfileId: selectedTacticId,
        providerId,
        priority,
      });
      priority++;
    }

    return chain;
  }
}
