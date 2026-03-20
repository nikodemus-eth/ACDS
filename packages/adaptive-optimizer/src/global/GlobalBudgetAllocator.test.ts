import { describe, it, expect, beforeEach } from 'vitest';
import { GlobalBudgetAllocator } from './GlobalBudgetAllocator.js';
import type { FamilyValueInput } from './FamilyValueScore.js';

function makeFamily(overrides: Partial<FamilyValueInput> = {}): FamilyValueInput {
  return {
    familyKey: 'fam:default',
    acceptanceRate: 0.8,
    executionVolume: 100,
    averageCostPerRun: 0.05,
    ...overrides,
  };
}

describe('GlobalBudgetAllocator', () => {
  let allocator: GlobalBudgetAllocator;

  beforeEach(() => {
    allocator = new GlobalBudgetAllocator();
  });

  it('distributes budget proportionally to value scores', () => {
    const families = [
      makeFamily({ familyKey: 'fam:high', acceptanceRate: 0.9, executionVolume: 200, averageCostPerRun: 0.01 }),
      makeFamily({ familyKey: 'fam:low', acceptanceRate: 0.2, executionVolume: 10, averageCostPerRun: 1.0 }),
    ];
    const result = allocator.rebalance(families, 1000);

    expect(result.totalBudget).toBe(1000);
    expect(result.allocations).toHaveLength(2);
    expect(result.lastRebalancedAt).toBeTruthy();

    // fam:high has much higher value score, should get more budget
    const highAlloc = result.allocations.find(a => a.familyKey === 'fam:high')!;
    const lowAlloc = result.allocations.find(a => a.familyKey === 'fam:low')!;
    expect(highAlloc.allocatedBudgetPct).toBeGreaterThan(lowAlloc.allocatedBudgetPct);

    // Percentages should sum to 100
    const totalPct = result.allocations.reduce((sum, a) => sum + a.allocatedBudgetPct, 0);
    expect(totalPct).toBeCloseTo(100, 5);
  });

  it('handles a single family (100% allocation)', () => {
    const result = allocator.rebalance([makeFamily()], 500);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].allocatedBudgetPct).toBeCloseTo(100, 5);
  });

  it('handles empty families array', () => {
    const result = allocator.rebalance([], 1000);
    expect(result.allocations).toHaveLength(0);
    expect(result.totalBudget).toBe(1000);
  });

  it('computes currentSpend correctly', () => {
    const families = [makeFamily({ averageCostPerRun: 0.1, executionVolume: 50 })];
    const result = allocator.rebalance(families, 100);
    // currentSpend = 0.1 * 50 = 5
    expect(result.allocations[0].currentSpend).toBeCloseTo(5, 10);
  });

  it('includes value scores in allocations', () => {
    const families = [makeFamily()];
    const result = allocator.rebalance(families, 100);
    expect(result.allocations[0].valueScore).toBeGreaterThan(0);
  });

  it('includes lastAdjustedAt on each allocation', () => {
    const result = allocator.rebalance([makeFamily()], 100);
    expect(new Date(result.allocations[0].lastAdjustedAt).getTime()).not.toBeNaN();
  });

  it('distributes equally when all value scores are zero (zeroCost edge)', () => {
    // If acceptanceRate is 0, value scores are all 0
    const families = [
      makeFamily({ familyKey: 'fam:a', acceptanceRate: 0 }),
      makeFamily({ familyKey: 'fam:b', acceptanceRate: 0 }),
    ];
    const result = allocator.rebalance(families, 1000);
    // totalValue = 0, so each gets 100/2 = 50%
    expect(result.allocations[0].allocatedBudgetPct).toBeCloseTo(50, 5);
    expect(result.allocations[1].allocatedBudgetPct).toBeCloseTo(50, 5);
  });

  it('uses minimum cost of 0.001 when averageCostPerRun is 0', () => {
    const families = [makeFamily({ averageCostPerRun: 0, acceptanceRate: 0.5, executionVolume: 100 })];
    const result = allocator.rebalance(families, 1000);
    // value = (0.5 * 100) / 0.001 = 50000
    expect(result.allocations[0].valueScore).toBeCloseTo(50000, 0);
  });
});

