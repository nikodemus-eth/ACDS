/**
 * BudgetAllocationState - Represents the current budget distribution
 * across execution families.
 */

export interface FamilyBudgetAllocation {
  /** The execution family this allocation targets. */
  familyKey: string;
  /** Percentage of total budget allocated to this family, 0-100. */
  allocatedBudgetPct: number;
  /** Current spend for this family. */
  currentSpend: number;
  /** Computed value score driving this allocation. */
  valueScore: number;
  /** ISO-8601 timestamp of the last adjustment. */
  lastAdjustedAt: string;
}

export interface BudgetAllocationState {
  /** Total budget available across all families. */
  totalBudget: number;
  /** Per-family budget allocations. */
  allocations: FamilyBudgetAllocation[];
  /** ISO-8601 timestamp of the last rebalance. */
  lastRebalancedAt: string;
}
