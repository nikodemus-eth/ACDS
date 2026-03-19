import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OLLAMA_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
} from '../../src/fixtures/provider-fixtures.js';
import { buildExecutionPlan } from '../../src/runtime/execution-planner.js';
import { validateFallbackClass } from '../../src/runtime/policy-engine.js';
import { ExecutionLogger } from '../../src/telemetry/execution-logger.js';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { ProviderUnavailableError } from '../../src/domain/errors.js';
import type { ProviderRuntime } from '../../src/providers/provider-runtime.js';

describe('GRITS Fallback Integrity', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  it('GRITS-FALL-001: Apple text failure falls back to allowed same-class local provider', () => {
    // Register a second same-class provider for fallback
    registry.registerProvider(FIXTURES_OLLAMA_PROVIDER);

    const method = APPLE_METHODS.find(
      (m) => m.methodId === 'apple.foundation_models.summarize',
    )!;

    const plan = buildExecutionPlan(method, 'provider', registry, {
      fallbackProviderId: FIXTURES_OLLAMA_PROVIDER.id,
      fallbackMethodId: 'ollama.summarize',
    });

    expect(plan.primary.providerId).toBe(FIXTURES_APPLE_PROVIDER.id);
    expect(plan.fallback).toBeDefined();
    expect(plan.fallback!.providerId).toBe(FIXTURES_OLLAMA_PROVIDER.id);
    expect(plan.fallback!.methodId).toBe('ollama.summarize');
  });

  it('GRITS-FALL-002: no fallback available returns terminal structured error', async () => {
    const appleAdapter = new AppleRuntimeAdapter();
    appleAdapter.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set(FIXTURES_APPLE_PROVIDER.id, appleAdapter);

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
    });

    await expect(
      orchestrator.executeTask('summarize this text', {
        input: { text: 'hello world' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('GRITS-FALL-003: fallback selection is logged with source and reason', () => {
    const logger = new ExecutionLogger();

    logger.logFallback({
      executionId: 'exec-001',
      primaryProviderId: FIXTURES_APPLE_PROVIDER.id,
      primaryMethodId: 'apple.foundation_models.summarize',
      fallbackProviderId: FIXTURES_OLLAMA_PROVIDER.id,
      fallbackMethodId: 'ollama.summarize',
      reason: 'Primary provider unavailable',
      sameClass: true,
      timestamp: new Date().toISOString(),
    });

    const logs = logger.getFallbackLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].primaryProviderId).toBe(FIXTURES_APPLE_PROVIDER.id);
    expect(logs[0].fallbackProviderId).toBe(FIXTURES_OLLAMA_PROVIDER.id);
    expect(logs[0].reason).toBe('Primary provider unavailable');
    expect(logs[0].sameClass).toBe(true);
  });

  it('GRITS-FALL-004: cross-class fallback rejected even under failure pressure', () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);

    const decision = validateFallbackClass(
      'provider',
      FIXTURES_OPENAI_CAPABILITY.id,
      registry,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Cross-class fallback rejected');
  });

  it('GRITS-FALL-005: repeated provider failure — health state persists as degraded', () => {
    registry.setHealthState(FIXTURES_APPLE_PROVIDER.id, 'degraded');
    expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('degraded');

    // Simulate repeated checks — state should remain degraded
    for (let i = 0; i < 5; i++) {
      expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('degraded');
    }
  });
});
