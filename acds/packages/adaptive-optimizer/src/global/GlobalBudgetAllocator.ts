/**
 * GlobalBudgetAllocator - Distributes budget across execution families
 * proportional to their computed value scores.
 */

import type { BudgetAllocationState, FamilyBudgetAllocation } from './BudgetAllocationState.js';
import { FamilyValueScorer, type FamilyValueInput } from './FamilyValueScore.js';

export class GlobalBudgetAllocator {
  private readonly scorer = new FamilyValueScorer();

  /**
   * Rebalances budget allocation across families based on their value scores.
   * Families with higher value scores receive a proportionally larger share.
   */
  rebalance(families: FamilyValueInput[], totalBudget: number): BudgetAllocationState {
    const scored = families.map(f => ({
      familyKey: f.familyKey,
      valueScore: this.scorer.compute(f),
      currentSpend: f.averageCostPerRun * f.executionVolume,
    }));

    const totalValue = scored.reduce((sum, s) => sum + s.valueScore, 0);

    const allocations: FamilyBudgetAllocation[] = scored.map(s => ({
      familyKey: s.familyKey,
      allocatedBudgetPct: totalValue > 0 ? (s.valueScore / totalValue) * 100 : 100 / scored.length,
      currentSpend: s.currentSpend,
      valueScore: s.valueScore,
      lastAdjustedAt: new Date().toISOString(),
    }));

    return {
      totalBudget,
      allocations,
      lastRebalancedAt: new Date().toISOString(),
    };
  }
}
