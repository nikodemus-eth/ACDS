import { describe, it, expect } from 'vitest';
import { FREE_COST, LOCAL_LATENCY } from '../../src/domain/cost-types.js';
import { DEFAULT_WEIGHTS } from '../../src/domain/score-types.js';

describe('cost-types constants', () => {
  it('FREE_COST has zero unit cost', () => {
    expect(FREE_COST.model).toBe('free');
    expect(FREE_COST.unitCost).toBe(0);
    expect(FREE_COST.currency).toBe('USD');
  });

  it('LOCAL_LATENCY has ordered percentiles', () => {
    expect(LOCAL_LATENCY.p50).toBeLessThan(LOCAL_LATENCY.p95);
    expect(LOCAL_LATENCY.p95).toBeLessThan(LOCAL_LATENCY.p99);
  });
});

describe('score-types constants', () => {
  it('DEFAULT_WEIGHTS sum to 1.0', () => {
    const sum = DEFAULT_WEIGHTS.cost + DEFAULT_WEIGHTS.latency + DEFAULT_WEIGHTS.reliability + DEFAULT_WEIGHTS.locality;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('all weights are non-negative', () => {
    expect(DEFAULT_WEIGHTS.cost).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.latency).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.reliability).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_WEIGHTS.locality).toBeGreaterThanOrEqual(0);
  });
});
