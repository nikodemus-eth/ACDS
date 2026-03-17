import { describe, it, expect } from 'vitest';
import { evaluateLatency } from './LatencyMetric.js';

describe('evaluateLatency', () => {
  it('returns 0.0 with reason when latencyMs is null', () => {
    const result = evaluateLatency({ latencyMs: null });
    expect(result.score).toBe(0.0);
    expect(result.label).toBe('latency');
    expect(result.details.reason).toBe('No latency data available');
  });

  it('returns 1.0 when latency is at or below idealMs (500)', () => {
    expect(evaluateLatency({ latencyMs: 0 }).score).toBe(1.0);
    expect(evaluateLatency({ latencyMs: 500 }).score).toBe(1.0);
  });

  it('returns 0.0 when latency is at or above maxMs (10000)', () => {
    expect(evaluateLatency({ latencyMs: 10000 }).score).toBe(0.0);
    expect(evaluateLatency({ latencyMs: 20000 }).score).toBe(0.0);
  });

  it('linearly interpolates between idealMs and maxMs', () => {
    // midpoint: 500 + (10000-500)/2 = 5250
    const result = evaluateLatency({ latencyMs: 5250 });
    expect(result.score).toBeCloseTo(0.5);
  });

  it('respects custom thresholds', () => {
    const result = evaluateLatency({ latencyMs: 750 }, { idealMs: 0, maxMs: 1000 });
    expect(result.score).toBeCloseTo(0.25);
  });

  it('includes latency details in the result', () => {
    const result = evaluateLatency({ latencyMs: 2000 });
    expect(result.details.latencyMs).toBe(2000);
    expect(result.details.idealMs).toBe(500);
    expect(result.details.maxMs).toBe(10000);
  });
});
