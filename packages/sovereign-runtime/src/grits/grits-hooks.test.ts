import { describe, it, expect } from 'vitest';
import { GRITSHookRunner } from './grits-hooks.js';
import { z } from 'zod';

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    output: { summary: 'test', tokenCount: 5 },
    metadata: {
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local' as const,
      deterministic: true,
      latencyMs: 15,
      validated: true,
      ...overrides,
    },
  };
}

describe('GRITSHookRunner', () => {
  it('validates with default config and passes', () => {
    const runner = new GRITSHookRunner();
    const result = runner.validate(makeResponse());
    expect(result.validated).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails when latency exceeds threshold', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 10 });
    const result = runner.validate(makeResponse({ latencyMs: 20 }));
    expect(result.validated).toBe(false);
  });

  it('warns when latency approaches threshold', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 20 });
    const result = runner.validate(makeResponse({ latencyMs: 18 }));
    expect(result.validated).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('validates schema when method definition provided', () => {
    const runner = new GRITSHookRunner({ validateSchema: true });
    const method = {
      methodId: 'test',
      providerId: 'test',
      subsystem: 'test',
      policyTier: 'A' as any,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.object({ summary: z.string(), tokenCount: z.number() }),
    };
    const result = runner.validate(makeResponse(), method);
    expect(result.validated).toBe(true);
  });

  it('fails schema validation for invalid output', () => {
    const runner = new GRITSHookRunner({ validateSchema: true });
    const method = {
      methodId: 'test',
      providerId: 'test',
      subsystem: 'test',
      policyTier: 'A' as any,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.object({ required_field: z.string() }),
    };
    const result = runner.validate(makeResponse(), method);
    expect(result.validated).toBe(false);
  });

  it('skips schema validation when disabled', () => {
    const runner = new GRITSHookRunner({ validateSchema: false });
    const result = runner.validate(makeResponse());
    expect(result.validated).toBe(true);
  });

  it('records and clears events', () => {
    const runner = new GRITSHookRunner();
    runner.validate(makeResponse());
    expect(runner.getEvents().length).toBeGreaterThan(0);
    runner.clearEvents();
    expect(runner.getEvents().length).toBe(0);
  });
});
