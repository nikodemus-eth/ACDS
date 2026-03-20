import type { ModelProfile } from '@acds/core-types';
import type { CandidateEvaluation } from '@acds/core-types';

export interface RankedCandidate {
  profileId: string;
  providerId: string;
  rank: number;
}

export class TriageRanker {
  rank(
    evaluations: CandidateEvaluation[],
    profiles: ModelProfile[],
    profileProviderMap: Map<string, string>,
  ): RankedCandidate[] {
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const eligible = evaluations
      .filter((e) => e.eligible)
      .map((e) => {
        const profile = profileMap.get(e.modelProfileId);
        const providerId = profileProviderMap.get(e.modelProfileId) ?? '';
        return { evaluation: e, profile, providerId };
      })
      .filter((e) => e.profile !== undefined);

    eligible.sort((a, b) => {
      // 1. Lowest cost first (minimum sufficient intelligence)
      const costA = a.profile!.costPer1kInput + a.profile!.costPer1kOutput;
      const costB = b.profile!.costPer1kInput + b.profile!.costPer1kOutput;
      if (costA !== costB) return costA - costB;

      // 2. Smallest context window first (simpler model)
      if (a.profile!.contextWindow !== b.profile!.contextWindow) {
        return a.profile!.contextWindow - b.profile!.contextWindow;
      }

      // 3. Stable tie-breaker: alphabetical by profile ID
      return a.profile!.id.localeCompare(b.profile!.id);
    });

    return eligible.map((e, index) => ({
      profileId: e.profile!.id,
      providerId: e.providerId,
      rank: index + 1,
    }));
  }
}
