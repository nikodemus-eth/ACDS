import { describe, it, expect } from 'vitest';
import { evaluateCorrectionBurden } from './CorrectionBurdenMetric.js';

describe('evaluateCorrectionBurden', () => {
  it('returns 1.0 for zero corrections', () => {
    const result = evaluateCorrectionBurden({ correctionCount: 0 });
    expect(result.score).toBe(1.0);
    expect(result.label).toBe('correction-burden');
  });

  it('decrements by 0.2 per correction', () => {
    expect(evaluateCorrectionBurden({ correctionCount: 1 }).score).toBeCloseTo(0.8);
    expect(evaluateCorrectionBurden({ correctionCount: 2 }).score).toBeCloseTo(0.6);
    expect(evaluateCorrectionBurden({ correctionCount: 3 }).score).toBeCloseTo(0.4);
  });

  it('floors at 0.0 for 5 or more corrections', () => {
    expect(evaluateCorrectionBurden({ correctionCount: 5 }).score).toBe(0.0);
    expect(evaluateCorrectionBurden({ correctionCount: 10 }).score).toBe(0.0);
  });

  it('includes correctionCount in details', () => {
    const result = evaluateCorrectionBurden({ correctionCount: 3 });
    expect(result.details.correctionCount).toBe(3);
    expect(result.details.decrementPerCorrection).toBe(0.2);
  });
});
