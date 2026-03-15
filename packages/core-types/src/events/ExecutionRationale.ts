export interface ExecutionRationale {
  id: string;
  routingDecisionId: string;
  executionFamilyKey: string;
  selectedProfileReason: string;
  selectedTacticReason: string;
  selectedProviderReason: string;
  policyMatchSummary: string;
  eligibleProfileCount: number;
  eligibleTacticCount: number;
  constraintsSummary: string;
  createdAt: Date;
}
