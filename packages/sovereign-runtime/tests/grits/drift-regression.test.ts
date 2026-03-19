import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { FIXTURES_APPLE_PROVIDER } from '../../src/fixtures/provider-fixtures.js';
import { resolveIntent } from '../../src/runtime/intent-resolver.js';
import { resolveMethod } from '../../src/runtime/method-resolver.js';
import { validateOutputSchema } from '../../src/grits/schema-validator.js';
import { validateLatency } from '../../src/grits/latency-validator.js';
import { checkResolverDrift, checkCapabilityCreep } from '../../src/grits/drift-signals.js';
import { z } from 'zod';

describe('GRITS Drift Regression', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  it('GRITS-DRIFT-001: resolver drift — same task, same registry, same result', () => {
    const task = 'summarize this text';
    const results: string[] = [];

    for (let i = 0; i < 10; i++) {
      const intent = resolveIntent(task);
      expect(intent).toBeDefined();
      const { method } = resolveMethod(intent!.intent, registry);
      results.push(method.methodId);
    }

    // All 10 runs must yield identical method IDs
    const unique = new Set(results);
    expect(unique.size).toBe(1);
    expect(results[0]).toBe('apple.foundation_models.summarize');
  });

  it('GRITS-DRIFT-002: schema drift — Apple method output validated against Zod schema', () => {
    const summarizeMethod = APPLE_METHODS.find(
      (m) => m.methodId === 'apple.foundation_models.summarize',
    )!;

    // Valid output
    const validOutput = { summary: 'A brief summary.', tokenCount: 12 };
    const validResult = validateOutputSchema(validOutput, summarizeMethod.outputSchema);
    expect(validResult.status).toBe('pass');

    // Invalid output — missing tokenCount
    const invalidOutput = { summary: 'A brief summary.' };
    const invalidResult = validateOutputSchema(invalidOutput, summarizeMethod.outputSchema);
    expect(invalidResult.status).toBe('fail');
  });

  it('GRITS-DRIFT-003: latency drift — alert when latency exceeds threshold', () => {
    // Latency well within threshold
    const okResult = validateLatency(100, 5000);
    expect(okResult.status).toBe('pass');

    // Latency exceeding threshold
    const highResult = validateLatency(6000, 5000);
    expect(highResult.status).toBe('fail');
    expect(highResult.message).toContain('exceeds');

    // Latency approaching threshold (warning zone: > 80% of threshold)
    const warnResult = validateLatency(4500, 5000);
    expect(warnResult.status).toBe('warning');
  });

  it('GRITS-DRIFT-004: fallback drift — checkResolverDrift with mismatched method IDs returns drift signal', () => {
    const signal = checkResolverDrift(
      'apple.foundation_models.summarize',
      'ollama.summarize',
      'summarize this text',
    );

    expect(signal).toBeDefined();
    expect(signal!.type).toBe('resolver_drift');
    expect(signal!.severity).toBe('high');
    expect(signal!.details).toBeDefined();
    expect(signal!.details!.expected).toBe('apple.foundation_models.summarize');
    expect(signal!.details!.actual).toBe('ollama.summarize');
  });

  it('GRITS-DRIFT-005: capability creep — checkCapabilityCreep with wrong class returns signal', () => {
    const signal = checkCapabilityCreep(
      'capability',
      'provider',
      'apple.foundation_models.summarize',
    );

    expect(signal).toBeDefined();
    expect(signal!.type).toBe('capability_creep');
    expect(signal!.severity).toBe('high');
    expect(signal!.details).toBeDefined();
    expect(signal!.details!.expectedClass).toBe('provider');
    expect(signal!.details!.actualClass).toBe('capability');
  });
});
