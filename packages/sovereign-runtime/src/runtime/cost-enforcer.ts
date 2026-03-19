import type { CostProfile, CostConstraints } from '../domain/cost-types.js';

export interface CostEnforcementResult {
  allowed: boolean;
  estimatedCost: number;
  reason?: string;
}

export function enforceCostCeiling(
  providerCost: CostProfile,
  constraints: CostConstraints,
  estimatedTokens?: number,
): CostEnforcementResult {
  if (providerCost.model === 'free') {
    return { allowed: true, estimatedCost: 0 };
  }

  let estimatedCost: number;
  if (providerCost.model === 'per_request') {
    estimatedCost = providerCost.unitCost;
  } else if (providerCost.model === 'per_token' && estimatedTokens) {
    estimatedCost = providerCost.unitCost * estimatedTokens;
  } else {
    estimatedCost = providerCost.unitCost; // default to unit cost
  }

  if (constraints.maxCostPerRequest !== undefined && estimatedCost > constraints.maxCostPerRequest) {
    return {
      allowed: false,
      estimatedCost,
      reason: `Estimated cost $${estimatedCost.toFixed(4)} exceeds ceiling $${constraints.maxCostPerRequest.toFixed(4)}`,
    };
  }

  return { allowed: true, estimatedCost };
}
