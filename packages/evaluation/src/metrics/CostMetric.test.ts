import { describe, it, expect } from 'vitest';
import { evaluateCost } from './CostMetric.js';

describe('evaluateCost', () => {
  it('returns 0.0 with reason when costEstimate is null', () => {
    const result = evaluateCost({ costEstimate: null });
    expect(result.score).toBe(0.0);
    expect(result.label).toBe('cost');
    expect(result.details.reason).toBe('No cost data available');
  });

  it('returns 1.0 when cost is at or below idealCost', () => {
    expect(evaluateCost({ costEstimate: 0.0 }).score).toBe(1.0);
    expect(evaluateCost({ costEstimate: 0.001 }).score).toBe(1.0);
  });

  it('returns 0.0 when cost is at or above maxCost', () => {
    expect(evaluateCost({ costEstimate: 0.10 }).score).toBe(0.0);
    expect(evaluateCost({ costEstimate: 1.0 }).score).toBe(0.0);
  });

  it('linearly interpolates between idealCost and maxCost', () => {
    // midpoint between 0.001 and 0.10 => ~0.0505
    const result = evaluateCost({ costEstimate: 0.0505 });
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  it('respects custom thresholds', () => {
    const result = evaluateCost({ costEstimate: 5 }, { idealCost: 0, maxCost: 10 });
    expect(result.score).toBeCloseTo(0.5);
  });

  it('includes cost details in the result', () => {
    const result = evaluateCost({ costEstimate: 0.05 });
    expect(result.details.costEstimate).toBe(0.05);
    expect(result.details.idealCost).toBe(0.001);
    expect(result.details.maxCost).toBe(0.10);
  });
});
