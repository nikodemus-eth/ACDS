import { describe, it, expect } from 'vitest';
import { FREE_COST, LOCAL_LATENCY } from './cost-types.js';

describe('cost-types constants', () => {
  it('FREE_COST has zero unit cost and free model', () => {
    expect(FREE_COST.model).toBe('free');
    expect(FREE_COST.unitCost).toBe(0);
    expect(FREE_COST.currency).toBe('USD');
  });

  it('LOCAL_LATENCY has ordered percentiles', () => {
    expect(LOCAL_LATENCY.p50).toBeLessThan(LOCAL_LATENCY.p95);
    expect(LOCAL_LATENCY.p95).toBeLessThan(LOCAL_LATENCY.p99);
    expect(LOCAL_LATENCY.p50).toBe(50);
    expect(LOCAL_LATENCY.p95).toBe(200);
    expect(LOCAL_LATENCY.p99).toBe(500);
  });
});
