import type { ExecutionRationale } from '@acds/core-types';

export interface FormattedRationale {
  id: string;
  routingDecisionId: string;
  executionFamilyKey: string;
  summary: string;
  details: Record<string, string>;
  createdAt: string;
}

export class RationaleFormatter {
  format(rationale: ExecutionRationale): FormattedRationale {
    return {
      id: rationale.id,
      routingDecisionId: rationale.routingDecisionId,
      executionFamilyKey: rationale.executionFamilyKey,
      summary: `${rationale.selectedProfileReason} | ${rationale.selectedTacticReason}`,
      details: {
        profile: rationale.selectedProfileReason,
        tactic: rationale.selectedTacticReason,
        provider: rationale.selectedProviderReason,
        policy: rationale.policyMatchSummary,
        constraints: rationale.constraintsSummary,
        eligibleProfiles: String(rationale.eligibleProfileCount),
        eligibleTactics: String(rationale.eligibleTacticCount),
      },
      createdAt: rationale.createdAt.toISOString(),
    };
  }
}
