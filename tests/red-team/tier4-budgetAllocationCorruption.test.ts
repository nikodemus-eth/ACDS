/**
 * ARGUS-9 Tier 4 — Budget Allocation & Value Score Corruption
 *
 * Tests that GlobalBudgetAllocator and FamilyValueScorer accept adversarial
 * inputs: negative budgets, extreme volumes, zero costs, and NaN propagation.
 */

import { describe, it, expect } from 'vitest';
import { FamilyValueScorer, GlobalBudgetAllocator } from '@acds/adaptive-optimizer';

describe('ARGUS: Budget Allocation & Value Score Corruption', () => {

  describe('FamilyValueScorer.compute — input manipulation', () => {

    it('accepts acceptanceRate > 1.0 — inflated value score', () => {
      // VULN: no bounds check on acceptanceRate
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: 5.0,
        executionVolume: 100,
        averageCostPerRun: 0.01,
      });
      // 5.0 * 100 / 0.01 = 50000
      expect(result).toBe(50000);
    });

    it('accepts negative acceptanceRate — negative value score', () => {
      // VULN: no bounds check, negative rate produces negative value
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: -1.0,
        executionVolume: 100,
        averageCostPerRun: 0.01,
      });
      expect(result).toBeLessThan(0);
    });

    it('cost floor at 0.001 prevents division by zero', () => {
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: 0.8,
        executionVolume: 100,
        averageCostPerRun: 0,
      });
      // Math.max(0, 0.001) = 0.001, 0.8 * 100 / 0.001 = 80000
      expect(result).toBe(80000);
    });

    it('negative cost is floored at 0.001', () => {
      // VULN: Math.max(-5, 0.001) = 0.001 — negative costs are silently corrected
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: 0.5,
        executionVolume: 10,
        averageCostPerRun: -5,
      });
      // Math.max(-5, 0.001) = 0.001, 0.5 * 10 / 0.001 = 5000
      expect(result).toBe(5000);
    });

    it('NaN executionVolume produces NaN score', () => {
      // VULN: NaN propagates silently
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: 0.8,
        executionVolume: NaN,
        averageCostPerRun: 0.01,
      });
      expect(isNaN(result)).toBe(true);
    });

    it('Infinity executionVolume produces Infinity score', () => {
      // VULN: extreme volumes accepted
      const scorer = new FamilyValueScorer();
      const result = scorer.compute({
        familyKey: 'fam',
        acceptanceRate: 0.8,
        executionVolume: Infinity,
        averageCostPerRun: 0.01,
      });
      expect(result).toBe(Infinity);
    });
  });

  describe('GlobalBudgetAllocator.rebalance — allocation abuse', () => {

    it('negative totalBudget accepted without validation', () => {
      // VULN: negative budget is stored as-is
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([
        { familyKey: 'fam', acceptanceRate: 0.8, executionVolume: 100, averageCostPerRun: 0.01 },
      ], -1000);
      expect(result.totalBudget).toBe(-1000);
    });

    it('empty families array does not throw — returns empty allocations', () => {
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([], 1000);
      expect(result.allocations).toHaveLength(0);
    });

    it('all families with zero value get equal allocation', () => {
      // totalValue = 0 → falls through to 100/scored.length
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([
        { familyKey: 'a', acceptanceRate: 0, executionVolume: 0, averageCostPerRun: 0.01 },
        { familyKey: 'b', acceptanceRate: 0, executionVolume: 0, averageCostPerRun: 0.01 },
      ], 1000);
      expect(result.allocations[0].allocatedBudgetPct).toBe(50);
      expect(result.allocations[1].allocatedBudgetPct).toBe(50);
    });

    it('NaN value score produces NaN allocation percentage', () => {
      // VULN: NaN propagates through totalValue calculation
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([
        { familyKey: 'a', acceptanceRate: 0.8, executionVolume: NaN, averageCostPerRun: 0.01 },
        { familyKey: 'b', acceptanceRate: 0.8, executionVolume: 100, averageCostPerRun: 0.01 },
      ], 1000);
      // totalValue = NaN + 8000 = NaN → NaN > 0 is false → 100/2 = 50 each
      expect(result.allocations[0].allocatedBudgetPct).toBe(50);
    });

    it('single family with Infinity value gets 100% allocation', () => {
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([
        { familyKey: 'inf', acceptanceRate: 0.8, executionVolume: Infinity, averageCostPerRun: 0.01 },
        { familyKey: 'normal', acceptanceRate: 0.8, executionVolume: 100, averageCostPerRun: 0.01 },
      ], 1000);
      // totalValue = Infinity + 8000 = Infinity
      // inf allocation: (Infinity / Infinity) * 100 = NaN
      expect(isNaN(result.allocations[0].allocatedBudgetPct)).toBe(true);
    });

    it('negative acceptance rate produces negative value — skews allocation', () => {
      // VULN: family with negative value reduces total, inflating other allocations
      const allocator = new GlobalBudgetAllocator();
      const result = allocator.rebalance([
        { familyKey: 'bad', acceptanceRate: -1.0, executionVolume: 100, averageCostPerRun: 0.01 },
        { familyKey: 'good', acceptanceRate: 0.8, executionVolume: 100, averageCostPerRun: 0.01 },
      ], 1000);
      // bad value = -1.0 * 100 / 0.01 = -10000
      // good value = 0.8 * 100 / 0.01 = 8000
      // totalValue = -10000 + 8000 = -2000
      // -2000 > 0 is false → 100/2 = 50% each
      expect(result.allocations[0].allocatedBudgetPct).toBe(50);
    });
  });
});
