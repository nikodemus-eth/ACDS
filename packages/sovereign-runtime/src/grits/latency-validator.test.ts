import { describe, it, expect } from 'vitest';
import { validateLatency } from './latency-validator.js';

describe('Latency Validator', () => {
  it('passes when well under threshold', () => {
    const result = validateLatency(100, 5000);
    expect(result.status).toBe('pass');
    expect(result.severity).toBe('low');
  });

  it('warns when approaching threshold (above 80%)', () => {
    const result = validateLatency(4500, 5000);
    expect(result.status).toBe('warning');
    expect(result.severity).toBe('medium');
    expect(result.details?.ratio).toBeCloseTo(0.9);
  });

  it('fails when exceeding threshold', () => {
    const result = validateLatency(6000, 5000);
    expect(result.status).toBe('fail');
    expect(result.severity).toBe('high');
    expect(result.details?.latencyMs).toBe(6000);
  });

  it('passes at exactly 80% of threshold', () => {
    const result = validateLatency(4000, 5000);
    expect(result.status).toBe('pass');
  });

  it('warns at exactly the threshold', () => {
    const result = validateLatency(5000, 5000);
    expect(result.status).toBe('warning');
  });

  it('uses default threshold when not specified', () => {
    const result = validateLatency(100);
    expect(result.status).toBe('pass');
  });
});
