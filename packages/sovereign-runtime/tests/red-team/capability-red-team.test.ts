import { describe, it, expect } from 'vitest';
import { CapabilityOrchestrator } from '../../src/runtime/capability-orchestrator.js';
import { CapabilityRegistry } from '../../src/registry/capability-registry.js';
import { createDefaultCapabilityRegistry } from '../../src/registry/default-registry.js';
import { CAPABILITY_CONTRACTS, CAPABILITY_IDS } from '../../src/domain/capability-taxonomy.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { FREE_COST, LOCAL_LATENCY } from '../../src/domain/cost-types.js';
import { scoreProviders } from '../../src/runtime/provider-scorer.js';
import { LineageBuilder } from '../../src/telemetry/lineage-builder.js';
import { PolicyBlockedError, MethodUnresolvedError, ProviderUnavailableError, InvalidRegistrationError } from '../../src/domain/errors.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../src/providers/provider-runtime.js';
import type { CapabilityBinding } from '../../src/registry/capability-binding.js';

/**
 * Red Team: Capability Fabric Adversarial Tests
 *
 * Probes edge cases, constraint conflicts, manipulation attempts,
 * immutability guarantees, and stress scenarios against the capability layer.
 */
describe('Red Team: Capability Fabric Adversarial Tests', () => {

  function makeOrchestrator(overrides?: {
    capabilityRegistry?: CapabilityRegistry;
    runtimes?: Map<string, ProviderRuntime>;
  }) {
    const capabilityRegistry = overrides?.capabilityRegistry ?? createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = overrides?.runtimes ?? new Map<string, ProviderRuntime>([
      ['apple-intelligence-runtime', new AppleRuntimeAdapter()],
    ]);

    return new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
    });
  }

  // ── Constraint edge cases ──

  it('RED-CAP-001: request with no eligible providers after maxLatencyMs filtering', async () => {
    const orchestrator = makeOrchestrator();

    // Apple LOCAL_LATENCY p95=200ms; setting maxLatencyMs=1ms should exclude all
    await expect(
      orchestrator.request({
        capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
        input: { text: 'Test' },
        constraints: { maxLatencyMs: 1 },
      }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it('RED-CAP-002: conflicting constraints - localOnly=true with only remote bindings', async () => {
    // Create a registry with only a remote binding
    const capabilityRegistry = new CapabilityRegistry();
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_SUMMARIZE)!;
    capabilityRegistry.registerContract(contract);

    capabilityRegistry.bindProvider({
      capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
      capabilityVersion: '1.0',
      providerId: 'cloud-provider',
      methodId: 'cloud.summarize',
      cost: { model: 'per_request', unitCost: 0.01, currency: 'USD' },
      latency: { p50: 300, p95: 600, p99: 1200 },
      reliability: 0.99,
      locality: 'remote',
    });

    const cloudRuntime: ProviderRuntime = {
      providerId: 'cloud-provider',
      async execute() { return { output: {}, latencyMs: 1, deterministic: true, executionMode: 'local' as const }; },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const orchestrator = makeOrchestrator({
      capabilityRegistry,
      runtimes: new Map([['cloud-provider', cloudRuntime]]),
    });

    // localOnly=true but only remote bindings -> PolicyBlockedError
    await expect(
      orchestrator.request({
        capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
        input: { text: 'Test' },
        constraints: { localOnly: true },
      }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it('RED-CAP-003: cost manipulation - FREE_COST always passes regardless of ceiling', async () => {
    const orchestrator = makeOrchestrator();

    // maxCostUSD=0 with free Apple provider should succeed (FREE_COST model bypasses ceiling)
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Test' },
      constraints: { maxCostUSD: 0 },
    });

    expect(response.metadata.costUSD).toBe(0);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
  });

  it('RED-CAP-004: capability version mismatch - request version 99.0 when only 1.0 registered', async () => {
    const orchestrator = makeOrchestrator();

    // Current implementation does not enforce version matching in the orchestrator.
    // The contract lookup is by ID only; version in the request is informational.
    // This test documents the behavior: the request succeeds because version is not checked.
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      version: '99.0',
      input: { text: 'Test' },
    });

    // Succeeds despite version mismatch - documents current behavior
    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.TEXT_SUMMARIZE);
    expect(response.metadata.capabilityVersion).toBe('1.0'); // Returns the registered version, not requested
  });

  it('RED-CAP-005: bind provider to capability twice with same method throws InvalidRegistrationError', () => {
    const registry = new CapabilityRegistry();
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_SUMMARIZE)!;
    registry.registerContract(contract);

    const binding: CapabilityBinding = {
      capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
      capabilityVersion: '1.0',
      providerId: 'test-provider',
      methodId: 'test.summarize',
      cost: FREE_COST,
      latency: LOCAL_LATENCY,
      reliability: 0.9,
      locality: 'local',
    };

    registry.bindProvider(binding);
    expect(() => registry.bindProvider(binding)).toThrow(InvalidRegistrationError);
  });

  it('RED-CAP-006: score with all zero-reliability providers still produces a ranking', () => {
    const bindings: CapabilityBinding[] = [
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'zero-a',
        methodId: 'zero-a.summarize',
        cost: FREE_COST,
        latency: LOCAL_LATENCY,
        reliability: 0,
        locality: 'local',
      },
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'zero-b',
        methodId: 'zero-b.summarize',
        cost: FREE_COST,
        latency: LOCAL_LATENCY,
        reliability: 0,
        locality: 'local',
      },
    ];

    const result = scoreProviders(bindings, {});

    expect(result.scores.length).toBe(2);
    expect(result.winner).toBeDefined();
    // Both have zero reliability but equal scores overall
    expect(result.scores[0].reliabilityScore).toBe(0);
    expect(result.scores[1].reliabilityScore).toBe(0);
  });

  it('RED-CAP-007: capability orchestrator with no runtimes registered throws ProviderUnavailableError', async () => {
    const orchestrator = makeOrchestrator({
      runtimes: new Map(), // No runtimes
    });

    await expect(
      orchestrator.request({
        capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
        input: { text: 'Test' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('RED-CAP-008: sensitivity=high with only remote provider throws PolicyBlockedError', async () => {
    const capabilityRegistry = new CapabilityRegistry();
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_SUMMARIZE)!;
    capabilityRegistry.registerContract(contract);

    capabilityRegistry.bindProvider({
      capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
      capabilityVersion: '1.0',
      providerId: 'remote-only',
      methodId: 'remote.summarize',
      cost: { model: 'per_request', unitCost: 0.01, currency: 'USD' },
      latency: { p50: 200, p95: 400, p99: 800 },
      reliability: 0.99,
      locality: 'remote',
    });

    const remoteRuntime: ProviderRuntime = {
      providerId: 'remote-only',
      async execute() { return { output: {}, latencyMs: 1, deterministic: true, executionMode: 'controlled_remote' as const }; },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const orchestrator = makeOrchestrator({
      capabilityRegistry,
      runtimes: new Map([['remote-only', remoteRuntime]]),
    });

    await expect(
      orchestrator.request({
        capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
        input: { text: 'Highly sensitive data' },
        constraints: { sensitivity: 'high' },
      }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it('RED-CAP-009: lineage tampering - builder produces immutable lineage', () => {
    const builder = new LineageBuilder('exec-tamper', CAPABILITY_IDS.TEXT_SUMMARIZE);
    builder.addStep('request', { capability: CAPABILITY_IDS.TEXT_SUMMARIZE });
    builder.addStep('execution', { latencyMs: 10 });

    const lineage = builder.build();
    const originalLength = lineage.steps.length;

    // Attempt to tamper: push into the built lineage's steps array
    lineage.steps.push({
      phase: 'validation',
      timestamp: new Date().toISOString(),
      details: { injected: true },
    });

    // Build again - the original builder state should be unaffected
    const lineage2 = builder.build();
    expect(lineage2.steps.length).toBe(originalLength);

    // The first lineage object was mutated (it's a plain array),
    // but the builder's internal state was not compromised
    expect(lineage.steps.length).toBe(originalLength + 1); // external mutation visible on the copy
    expect(lineage2.steps.length).toBe(originalLength); // builder unaffected
  });

  it('RED-CAP-010: stress test - score 100 bindings for performance and determinism', () => {
    const bindings: CapabilityBinding[] = [];
    for (let i = 0; i < 100; i++) {
      bindings.push({
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: `provider-${i}`,
        methodId: `provider-${i}.summarize`,
        cost: { model: i % 3 === 0 ? 'free' : 'per_request', unitCost: i * 0.001, currency: 'USD' },
        latency: { p50: 20 + i, p95: 100 + i * 2, p99: 300 + i * 3 },
        reliability: 0.5 + (i % 50) * 0.01,
        locality: i % 2 === 0 ? 'local' : 'remote',
      });
    }

    const start = performance.now();
    const result1 = scoreProviders(bindings, {});
    const elapsed = performance.now() - start;

    // Should be fast even with 100 bindings
    expect(elapsed).toBeLessThan(100); // < 100ms

    // Determinism: run again and verify same result
    const result2 = scoreProviders(bindings, {});
    expect(result1.winner.providerId).toBe(result2.winner.providerId);
    expect(result1.scores.length).toBe(result2.scores.length);

    // All scores should be in descending order
    for (let i = 1; i < result1.scores.length; i++) {
      expect(result1.scores[i - 1].totalScore).toBeGreaterThanOrEqual(result1.scores[i].totalScore);
    }
  });
});
