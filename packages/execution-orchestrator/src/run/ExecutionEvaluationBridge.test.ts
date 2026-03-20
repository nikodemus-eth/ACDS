import { describe, it, expect } from 'vitest';
import { evaluateOutcome } from './ExecutionEvaluationBridge.js';
import type { ExecutionOutcome } from '../events/ExecutionOutcomePublisher.js';
import type { EvaluationServices } from './ExecutionEvaluationBridge.js';

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    executionId: 'exec-1',
    familyKey: 'app:process:step',
    status: 'success',
    latencyMs: 200,
    adapterResponseSummary: { model: 'gpt-4' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('evaluateOutcome', () => {
  it('returns metricResults and executionScore for a success outcome', () => {
    const result = evaluateOutcome(makeOutcome());

    expect(result.metricResults).toBeDefined();
    expect(result.metricResults.length).toBeGreaterThanOrEqual(2);
    expect(result.executionScore).toBeDefined();
    expect(typeof result.executionScore.compositeScore).toBe('number');
  });

  it('evaluates acceptance as accepted for success status', () => {
    const result = evaluateOutcome(makeOutcome({ status: 'success' }));
    const acceptance = result.metricResults.find((m) => m.label === 'acceptance');
    expect(acceptance).toBeDefined();
    expect(acceptance!.score).toBe(1);
  });

  it('evaluates acceptance as accepted for fallback_success status', () => {
    const result = evaluateOutcome(makeOutcome({ status: 'fallback_success' }));
    const acceptance = result.metricResults.find((m) => m.label === 'acceptance');
    expect(acceptance).toBeDefined();
    expect(acceptance!.score).toBe(1);
  });

  it('evaluates acceptance as rejected for failure status', () => {
    const result = evaluateOutcome(makeOutcome({ status: 'failure' }));
    const acceptance = result.metricResults.find((m) => m.label === 'acceptance');
    expect(acceptance).toBeDefined();
    expect(acceptance!.score).toBe(0);
  });

  it('evaluates acceptance as rejected for fallback_failure status', () => {
    const result = evaluateOutcome(makeOutcome({ status: 'fallback_failure' }));
    const acceptance = result.metricResults.find((m) => m.label === 'acceptance');
    expect(acceptance).toBeDefined();
    expect(acceptance!.score).toBe(0);
  });

  it('evaluates latency using default thresholds', () => {
    const result = evaluateOutcome(makeOutcome({ latencyMs: 200 }));
    const latency = result.metricResults.find((m) => m.label === 'latency');
    expect(latency).toBeDefined();
    expect(latency!.score).toBeGreaterThan(0);
  });

  it('uses custom latency thresholds when provided', () => {
    const services: EvaluationServices = {
      latencyThresholds: { idealMs: 100, maxMs: 500 },
    };
    const fastResult = evaluateOutcome(makeOutcome({ latencyMs: 50 }), services);
    const slowResult = evaluateOutcome(makeOutcome({ latencyMs: 600 }), services);

    const fastLatency = fastResult.metricResults.find((m) => m.label === 'latency');
    const slowLatency = slowResult.metricResults.find((m) => m.label === 'latency');

    expect(fastLatency!.score).toBeGreaterThan(slowLatency!.score);
  });

  it('uses default services when none provided', () => {
    const result = evaluateOutcome(makeOutcome());
    expect(result.metricResults.length).toBeGreaterThanOrEqual(2);
    expect(result.executionScore).toBeDefined();
  });

  it('passes weight config to score calculator', () => {
    const services: EvaluationServices = {
      weightConfig: { acceptance: 1.0, latency: 0.0 },
    };
    const result = evaluateOutcome(makeOutcome({ status: 'success', latencyMs: 99999 }), services);
    // With latency weight 0, the score should be driven by acceptance
    expect(result.executionScore.compositeScore).toBeGreaterThan(0);
  });

  it('produces a composite score between 0 and 1', () => {
    const result = evaluateOutcome(makeOutcome());
    expect(result.executionScore.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.executionScore.compositeScore).toBeLessThanOrEqual(1);
  });
});
