import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from '../../src/registry/capability-registry.js';
import { createDefaultCapabilityRegistry } from '../../src/registry/default-registry.js';
import { CAPABILITY_CONTRACTS, CAPABILITY_IDS } from '../../src/domain/capability-taxonomy.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { FREE_COST, LOCAL_LATENCY } from '../../src/domain/cost-types.js';
import { scoreProviders } from '../../src/runtime/provider-scorer.js';
import { enforceCostCeiling } from '../../src/runtime/cost-enforcer.js';
import { LineageBuilder } from '../../src/telemetry/lineage-builder.js';
import { InvalidRegistrationError } from '../../src/domain/errors.js';
import type { CapabilityBinding } from '../../src/registry/capability-binding.js';

/**
 * GRITS: Capability Fabric Integrity Tests
 *
 * Validates structural invariants, contract consistency, scoring determinism,
 * cost enforcement, lineage immutability, and registry constraints.
 */
describe('GRITS: Capability Fabric Integrity', () => {

  // ── Contract invariants ──

  it('GRITS-CAP-001: all capability contracts have non-empty ID and version', () => {
    for (const contract of CAPABILITY_CONTRACTS) {
      expect(contract.id).toBeTruthy();
      expect(contract.id.length).toBeGreaterThan(0);
      expect(contract.version).toBeTruthy();
      expect(contract.version.length).toBeGreaterThan(0);
    }
  });

  it('GRITS-CAP-002: all capability contracts have valid input and output schemas', () => {
    for (const contract of CAPABILITY_CONTRACTS) {
      expect(contract.inputSchema).toBeDefined();
      expect(contract.outputSchema).toBeDefined();
      // Zod schemas must have a parse method
      expect(typeof contract.inputSchema.parse).toBe('function');
      expect(typeof contract.outputSchema.parse).toBe('function');
    }
  });

  it('GRITS-CAP-003: every capability ID in taxonomy follows dot-notation (category.action)', () => {
    const ids = Object.values(CAPABILITY_IDS);
    const DOT_NOTATION = /^[a-z]+(\.[a-z_]+)+$/;

    for (const id of ids) {
      expect(id).toMatch(DOT_NOTATION);
    }
  });

  // ── Binding completeness ──

  it('GRITS-CAP-004: all Apple methods have a capability binding', () => {
    const registry = createDefaultCapabilityRegistry();

    // Collect all bound method IDs across all capabilities
    const boundMethodIds = new Set<string>();
    for (const contract of CAPABILITY_CONTRACTS) {
      const bindings = registry.getBindings(contract.id);
      for (const binding of bindings) {
        if (binding.providerId === 'apple-intelligence-runtime') {
          boundMethodIds.add(binding.methodId);
        }
      }
    }

    // Every Apple method should have at least one capability binding
    const unmapped: string[] = [];
    for (const method of APPLE_METHODS) {
      if (!boundMethodIds.has(method.methodId)) {
        unmapped.push(method.methodId);
      }
    }

    expect(unmapped).toEqual([]);
  });

  it('GRITS-CAP-005: no capability binding references non-existent provider in default registry', () => {
    const registry = createDefaultCapabilityRegistry();
    const knownProviders = new Set(['apple-intelligence-runtime']);

    for (const contract of CAPABILITY_CONTRACTS) {
      const bindings = registry.getBindings(contract.id);
      for (const binding of bindings) {
        expect(knownProviders.has(binding.providerId)).toBe(true);
      }
    }
  });

  // ── Scoring invariants ──

  it('GRITS-CAP-006: scoring is deterministic', () => {
    const bindings: CapabilityBinding[] = [
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'alpha',
        methodId: 'alpha.summarize',
        cost: FREE_COST,
        latency: LOCAL_LATENCY,
        reliability: 0.95,
        locality: 'local',
      },
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'beta',
        methodId: 'beta.summarize',
        cost: { model: 'per_request', unitCost: 0.01, currency: 'USD' },
        latency: { p50: 100, p95: 400, p99: 800 },
        reliability: 0.80,
        locality: 'remote',
      },
    ];

    const result1 = scoreProviders(bindings, {});
    const result2 = scoreProviders(bindings, {});

    expect(result1.scores.length).toBe(result2.scores.length);
    for (let i = 0; i < result1.scores.length; i++) {
      expect(result1.scores[i].totalScore).toBe(result2.scores[i].totalScore);
      expect(result1.scores[i].providerId).toBe(result2.scores[i].providerId);
    }
    expect(result1.winner.providerId).toBe(result2.winner.providerId);
  });

  it('GRITS-CAP-007: scoring result is ordered by descending total score', () => {
    const bindings: CapabilityBinding[] = [
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'low-score',
        methodId: 'low.summarize',
        cost: { model: 'per_request', unitCost: 0.05, currency: 'USD' },
        latency: { p50: 200, p95: 600, p99: 1200 },
        reliability: 0.50,
        locality: 'remote',
      },
      {
        capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
        capabilityVersion: '1.0',
        providerId: 'high-score',
        methodId: 'high.summarize',
        cost: FREE_COST,
        latency: LOCAL_LATENCY,
        reliability: 0.99,
        locality: 'local',
      },
    ];

    const result = scoreProviders(bindings, {});

    // Verify descending order
    for (let i = 1; i < result.scores.length; i++) {
      expect(result.scores[i - 1].totalScore).toBeGreaterThanOrEqual(result.scores[i].totalScore);
    }
    // Winner should be the highest scorer
    expect(result.winner.providerId).toBe('high-score');
  });

  // ── Cost enforcement ──

  it('GRITS-CAP-008: cost enforcement blocks over-ceiling requests', () => {
    const expensiveCost = { model: 'per_request' as const, unitCost: 0.10, currency: 'USD' as const };
    const result = enforceCostCeiling(expensiveCost, { maxCostPerRequest: 0.01 });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.estimatedCost).toBeGreaterThan(0.01);
  });

  it('GRITS-CAP-009: free provider always passes cost enforcement', () => {
    // Even with a zero ceiling, free providers pass
    const result = enforceCostCeiling(FREE_COST, { maxCostPerRequest: 0 });

    expect(result.allowed).toBe(true);
    expect(result.estimatedCost).toBe(0);
  });

  // ── Lineage ──

  it('GRITS-CAP-010: lineage builder captures all phases', () => {
    const builder = new LineageBuilder('exec-001', CAPABILITY_IDS.TEXT_SUMMARIZE);

    builder.addStep('request', { capability: CAPABILITY_IDS.TEXT_SUMMARIZE });
    builder.addStep('policy', { allowed: true });
    builder.addStep('scoring', { eligibleCount: 3 });
    builder.addStep('selection', { providerId: 'apple' });
    builder.addStep('execution', { latencyMs: 42 });
    builder.addStep('validation', { validated: true });

    const lineage = builder.build();

    expect(lineage.executionId).toBe('exec-001');
    expect(lineage.capabilityId).toBe(CAPABILITY_IDS.TEXT_SUMMARIZE);
    expect(lineage.steps.length).toBe(6);

    const phases = lineage.steps.map((s) => s.phase);
    expect(phases).toEqual(['request', 'policy', 'scoring', 'selection', 'execution', 'validation']);
    expect(lineage.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  // ── Registry constraints ──

  it('GRITS-CAP-011: capability registry rejects duplicate contract IDs', () => {
    const registry = new CapabilityRegistry();
    const contract = CAPABILITY_CONTRACTS[0];

    registry.registerContract(contract);
    expect(() => registry.registerContract(contract)).toThrow(InvalidRegistrationError);
  });

  it('GRITS-CAP-012: capability registry rejects binding to non-existent capability', () => {
    const registry = new CapabilityRegistry();

    const binding: CapabilityBinding = {
      capabilityId: 'nonexistent.capability',
      capabilityVersion: '1.0',
      providerId: 'test-provider',
      methodId: 'test.method',
      cost: FREE_COST,
      latency: LOCAL_LATENCY,
      reliability: 0.9,
      locality: 'local',
    };

    expect(() => registry.bindProvider(binding)).toThrow(InvalidRegistrationError);
  });
});
