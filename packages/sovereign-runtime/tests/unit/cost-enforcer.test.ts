import { describe, it, expect } from 'vitest';
import { enforceCostCeiling } from '../../src/runtime/cost-enforcer.js';
import { FREE_COST } from '../../src/domain/cost-types.js';
import type { CostProfile, CostConstraints } from '../../src/domain/cost-types.js';

describe('enforceCostCeiling', () => {
  describe('free providers', () => {
    it('always allows free cost model', () => {
      const result = enforceCostCeiling(FREE_COST, { maxCostPerRequest: 0 });
      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBe(0);
    });

    it('allows free model even with zero ceiling', () => {
      const result = enforceCostCeiling(FREE_COST, { maxCostPerRequest: 0 });
      expect(result.allowed).toBe(true);
    });
  });

  describe('per_request cost model', () => {
    const perRequest: CostProfile = { model: 'per_request', unitCost: 0.01, currency: 'USD' };

    it('allows when under ceiling', () => {
      const result = enforceCostCeiling(perRequest, { maxCostPerRequest: 0.05 });
      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBe(0.01);
    });

    it('blocks when over ceiling', () => {
      const result = enforceCostCeiling(perRequest, { maxCostPerRequest: 0.005 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds ceiling');
    });

    it('allows when equal to ceiling', () => {
      const result = enforceCostCeiling(perRequest, { maxCostPerRequest: 0.01 });
      expect(result.allowed).toBe(true);
    });
  });

  describe('per_token cost model', () => {
    const perToken: CostProfile = { model: 'per_token', unitCost: 0.00001, currency: 'USD' };

    it('estimates cost using token count', () => {
      const result = enforceCostCeiling(perToken, { maxCostPerRequest: 1.0 }, 1000);
      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBeCloseTo(0.01, 5);
    });

    it('blocks when token estimate exceeds ceiling', () => {
      const result = enforceCostCeiling(perToken, { maxCostPerRequest: 0.005 }, 1000);
      expect(result.allowed).toBe(false);
      expect(result.estimatedCost).toBeCloseTo(0.01, 5);
    });

    it('falls back to unit cost when no tokens provided', () => {
      const result = enforceCostCeiling(perToken, { maxCostPerRequest: 1.0 });
      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBe(0.00001);
    });
  });

  describe('no constraints', () => {
    it('allows when no maxCostPerRequest set', () => {
      const paid: CostProfile = { model: 'per_request', unitCost: 100, currency: 'USD' };
      const result = enforceCostCeiling(paid, {});
      expect(result.allowed).toBe(true);
      expect(result.estimatedCost).toBe(100);
    });
  });
});
