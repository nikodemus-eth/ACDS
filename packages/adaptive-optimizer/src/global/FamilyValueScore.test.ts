import { describe, it, expect } from 'vitest';
import { FamilyValueScorer, type FamilyValueInput } from './FamilyValueScore.js';

function makeInput(overrides: Partial<FamilyValueInput> = {}): FamilyValueInput {
  return {
    familyKey: 'fam:test',
    acceptanceRate: 0.8,
    executionVolume: 100,
    averageCostPerRun: 0.05,
    ...overrides,
  };
}

describe('FamilyValueScorer', () => {
  const scorer = new FamilyValueScorer();

  it('computes value as (acceptanceRate * executionVolume) / averageCostPerRun', () => {
    const result = scorer.compute(makeInput({
      acceptanceRate: 0.8,
      executionVolume: 100,
      averageCostPerRun: 0.05,
    }));
    // (0.8 * 100) / 0.05 = 1600
    expect(result).toBeCloseTo(1600, 5);
  });

  it('uses floor of 0.001 when averageCostPerRun is zero', () => {
    const result = scorer.compute(makeInput({ averageCostPerRun: 0 }));
    // (0.8 * 100) / 0.001 = 80000
    expect(result).toBeCloseTo(80000, 5);
  });

  it('uses floor of 0.001 when averageCostPerRun is negative', () => {
    const result = scorer.compute(makeInput({ averageCostPerRun: -5 }));
    // max(-5, 0.001) = 0.001, so (0.8 * 100) / 0.001 = 80000
    expect(result).toBeCloseTo(80000, 5);
  });

  it('returns 0 when acceptanceRate is 0', () => {
    const result = scorer.compute(makeInput({ acceptanceRate: 0 }));
    expect(result).toBe(0);
  });

  it('returns 0 when executionVolume is 0', () => {
    const result = scorer.compute(makeInput({ executionVolume: 0 }));
    expect(result).toBe(0);
  });

  it('handles high cost correctly', () => {
    const result = scorer.compute(makeInput({
      acceptanceRate: 0.5,
      executionVolume: 10,
      averageCostPerRun: 10,
    }));
    // (0.5 * 10) / 10 = 0.5
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('handles very small cost above floor', () => {
    const result = scorer.compute(makeInput({
      acceptanceRate: 1.0,
      executionVolume: 1,
      averageCostPerRun: 0.002,
    }));
    // (1.0 * 1) / 0.002 = 500
    expect(result).toBeCloseTo(500, 5);
  });

  it('handles cost exactly at floor (0.001)', () => {
    const result = scorer.compute(makeInput({
      acceptanceRate: 1.0,
      executionVolume: 1,
      averageCostPerRun: 0.001,
    }));
    // (1.0 * 1) / 0.001 = 1000
    expect(result).toBeCloseTo(1000, 5);
  });

  it('scales linearly with executionVolume', () => {
    const base = scorer.compute(makeInput({ executionVolume: 100 }));
    const doubled = scorer.compute(makeInput({ executionVolume: 200 }));
    expect(doubled).toBeCloseTo(base * 2, 5);
  });

  it('scales linearly with acceptanceRate', () => {
    const base = scorer.compute(makeInput({ acceptanceRate: 0.5 }));
    const doubled = scorer.compute(makeInput({ acceptanceRate: 1.0 }));
    expect(doubled).toBeCloseTo(base * 2, 5);
  });
});
