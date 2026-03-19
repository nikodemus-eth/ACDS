import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
  FIXTURES_OPENAI_SESSION,
} from '../../src/fixtures/provider-fixtures.js';
import { evaluatePolicy, validateFallbackClass } from '../../src/runtime/policy-engine.js';
import { PolicyTier } from '../../src/domain/policy-tiers.js';
import type { ACDSMethodRequest } from '../../src/domain/execution-request.js';
import { z } from 'zod';

describe('GRITS Policy Integrity', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    registry.registerSession(FIXTURES_OPENAI_SESSION);
  });

  it('GRITS-POL-001: capability invocation without approval is blocked', () => {
    // Try to use a capability through the provider path (no useCapability set)
    // but method references the capability provider — policy should block
    const method = {
      methodId: 'openai.gpt.summarize',
      providerId: 'openai-api',
      subsystem: 'foundation_models' as const,
      policyTier: PolicyTier.A,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    const request: ACDSMethodRequest = {
      providerId: 'openai-api',
      methodId: 'openai.gpt.summarize',
      input: { text: 'test' },
      // No useCapability set — attempting provider path
    };

    // Provider lookup for 'openai-api' will find a capability, not a provider
    const decision = evaluatePolicy(request, method, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBeDefined();
  });

  it('GRITS-POL-002: session without risk acknowledgment blocked', () => {
    const method = APPLE_METHODS[0]; // any method
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      useSession: FIXTURES_OPENAI_SESSION.id,
      riskAcknowledged: false,
    };

    const decision = evaluatePolicy(request, method, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('risk acknowledgment');
  });

  it('GRITS-POL-003: local_only blocks all non-provider execution', () => {
    const method = APPLE_METHODS[0];
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      useCapability: FIXTURES_OPENAI_CAPABILITY.id,
      constraints: { localOnly: true },
    };

    const decision = evaluatePolicy(request, method, registry, true);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('local_only');
  });

  it('GRITS-POL-004: Tier D external-augmented method blocked in sovereign mode', () => {
    const tierDMethod = {
      methodId: 'apple.cloud.augmented',
      providerId: FIXTURES_APPLE_PROVIDER.id,
      subsystem: 'foundation_models' as const,
      policyTier: PolicyTier.D,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    const request: ACDSMethodRequest = {
      providerId: FIXTURES_APPLE_PROVIDER.id,
      methodId: 'apple.cloud.augmented',
      input: {},
      constraints: { localOnly: true },
    };

    const decision = evaluatePolicy(request, tierDMethod, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Tier D');
  });

  it('GRITS-POL-005: cross-class fallback attempt blocked and logged', () => {
    const decision = validateFallbackClass(
      'provider',
      FIXTURES_OPENAI_CAPABILITY.id,
      registry,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Cross-class fallback rejected');
    expect(decision.details).toBeDefined();
    expect(decision.details!.primaryClass).toBe('provider');
    expect(decision.details!.fallbackClass).toBe('capability');
  });

  it('GRITS-POL-006: policy decision includes explicit reason code', () => {
    // Create a blocked decision and verify it has a non-empty reason
    const method = APPLE_METHODS[0];
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: {},
      useSession: FIXTURES_OPENAI_SESSION.id,
      riskAcknowledged: false,
    };

    const decision = evaluatePolicy(request, method, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBeDefined();
    expect(typeof decision.reason).toBe('string');
    expect(decision.reason!.length).toBeGreaterThan(0);
  });
});
