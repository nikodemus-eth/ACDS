import { describe, it, expect } from 'vitest';
import { RetryFrequencyMetric } from './RetryFrequencyMetric.js';

describe('RetryFrequencyMetric', () => {
  const metric = new RetryFrequencyMetric();

  it('returns 1.0 when no retries occurred', () => {
    expect(metric.compute({ retryCount: 0, maxRetriesAllowed: 5 })).toBe(1.0);
  });

  it('returns 0.0 when retries equal max allowed', () => {
    expect(metric.compute({ retryCount: 5, maxRetriesAllowed: 5 })).toBe(0.0);
  });

  it('returns proportional score for partial retries', () => {
    // 1 - 2/5 = 0.6
    expect(metric.compute({ retryCount: 2, maxRetriesAllowed: 5 })).toBeCloseTo(0.6);
  });

  it('returns 1.0 when maxRetriesAllowed is 0', () => {
    expect(metric.compute({ retryCount: 0, maxRetriesAllowed: 0 })).toBe(1);
  });

  it('clamps to 0 when retries exceed max', () => {
    expect(metric.compute({ retryCount: 10, maxRetriesAllowed: 3 })).toBe(0);
  });
});
