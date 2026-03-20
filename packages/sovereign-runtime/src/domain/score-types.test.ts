import { describe, it, expect } from 'vitest';
import { DEFAULT_WEIGHTS } from './score-types.js';

describe('score-types constants', () => {
  it('DEFAULT_WEIGHTS sum to 1.0', () => {
    const sum = DEFAULT_WEIGHTS.cost + DEFAULT_WEIGHTS.latency + DEFAULT_WEIGHTS.reliability + DEFAULT_WEIGHTS.locality;
    expect(sum).toBeCloseTo(1.0);
  });

  it('all weights are non-negative', () => {
    expect(DEFAULT_WEIGHTS.cost).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.latency).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.reliability).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.locality).toBeGreaterThanOrEqual(0);
  });

  it('has expected values', () => {
    expect(DEFAULT_WEIGHTS.cost).toBe(0.3);
    expect(DEFAULT_WEIGHTS.latency).toBe(0.3);
    expect(DEFAULT_WEIGHTS.reliability).toBe(0.3);
    expect(DEFAULT_WEIGHTS.locality).toBe(0.1);
  });
});
