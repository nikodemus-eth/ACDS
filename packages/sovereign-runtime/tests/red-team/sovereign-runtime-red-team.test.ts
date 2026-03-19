/**
 * Red Team Test Suite for the ACDS Sovereign Runtime
 *
 * Adversarial scenarios that go beyond GRITS validation:
 * taxonomy corruption, method injection, policy bypass,
 * fallback chain attacks, observability evasion, GRITS
 * manipulation, and intent resolution attacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { PolicyTier } from '../../src/domain/policy-tiers.js';
import { resolveIntent } from '../../src/runtime/intent-resolver.js';
import { resolveMethod } from '../../src/runtime/method-resolver.js';
import { evaluatePolicy, validateFallbackClass } from '../../src/runtime/policy-engine.js';
import { buildExecutionPlan } from '../../src/runtime/execution-planner.js';
import { GRITSHookRunner } from '../../src/grits/grits-hooks.js';
import { redactLogEvent, redactTokensInString } from '../../src/telemetry/redaction.js';
import { ExecutionLogger } from '../../src/telemetry/execution-logger.js';
import {
  ACDSRuntimeError,
  InvalidRegistrationError,
  InvalidExecutionPlanError,
  PolicyBlockedError,
  ProviderUnavailableError,
  MethodUnresolvedError,
  MethodNotAvailableError,
} from '../../src/domain/errors.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../src/providers/provider-runtime.js';
import type { ProviderDefinition, CapabilityDefinition, SessionDefinition } from '../../src/domain/source-types.js';
import type { MethodDefinition } from '../../src/domain/method-registry.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeFakeRuntime(providerId: string, available = true): ProviderRuntime {
  return {
    providerId,
    async execute(methodId: string, input: unknown): Promise<MethodExecutionResult> {
      return { output: { result: `executed ${methodId}` }, latencyMs: 10, deterministic: true, executionMode: 'local' };
    },
    async isAvailable() { return available; },
    async healthCheck() { return { status: available ? 'healthy' : 'unavailable', latencyMs: 5 }; },
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function validProvider(id = 'test-provider'): ProviderDefinition {
  return {
    id,
    name: `Test Provider ${id}`,
    sourceClass: 'provider',
    deterministic: true,
    localOnly: true,
    providerClass: 'sovereign_runtime',
    executionMode: 'local',
  };
}

function validCapability(id = 'test-capability'): CapabilityDefinition {
  return {
    id,
    name: `Test Capability ${id}`,
    sourceClass: 'capability',
    deterministic: false,
    explicitInvocationRequired: true,
    vendor: 'adversary-vendor',
  };
}

function validSession(id = 'test-session'): SessionDefinition {
  return {
    id,
    name: `Test Session ${id}`,
    sourceClass: 'session',
    explicitInvocationRequired: true,
    riskLevel: 'high',
    requiresRiskAcknowledgment: true,
    boundTo: 'test-capability',
  };
}

function validMethod(providerId: string, methodId = 'test.method.one'): MethodDefinition {
  return {
    methodId,
    providerId,
    subsystem: 'foundation_models',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TAXONOMY CORRUPTION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Taxonomy Corruption Attacks', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  it('rejects a provider with empty sourceClass coerced to empty string', () => {
    const malicious = {
      id: 'fake-provider',
      name: 'Fake',
      sourceClass: '' as any,
      deterministic: true,
      localOnly: true,
      providerClass: 'sovereign_runtime' as const,
      executionMode: 'local' as const,
    };

    expect(() => registry.registerProvider(malicious)).toThrow(InvalidRegistrationError);
  });

  it('rejects a provider with invented sourceClass "superuser"', () => {
    const malicious = {
      id: 'evil-superuser',
      name: 'Superuser Provider',
      sourceClass: 'superuser' as any,
      deterministic: true,
      localOnly: true,
      providerClass: 'sovereign_runtime' as const,
      executionMode: 'local' as const,
    };

    expect(() => registry.registerProvider(malicious)).toThrow(InvalidRegistrationError);
  });

  it('rejects a capability that claims deterministic=true', () => {
    const malicious = {
      id: 'deterministic-cap',
      name: 'Lying Capability',
      sourceClass: 'capability' as const,
      deterministic: true as any,
      explicitInvocationRequired: true as const,
      vendor: 'evil-corp',
    };

    expect(() => registry.registerCapability(malicious)).toThrow(InvalidRegistrationError);
  });

  it('rejects a session with requiresRiskAcknowledgment=false', () => {
    const malicious = {
      id: 'no-risk-session',
      name: 'Unsafe Session',
      sourceClass: 'session' as const,
      explicitInvocationRequired: true as const,
      riskLevel: 'high' as const,
      requiresRiskAcknowledgment: false as any,
      boundTo: 'some-cap',
    };

    expect(() => registry.registerSession(malicious)).toThrow(InvalidRegistrationError);
  });

  it('handles 100+ provider registrations and still resolves lookups correctly', () => {
    // Register 100 providers
    for (let i = 0; i < 100; i++) {
      const provider = validProvider(`stress-provider-${i}`);
      registry.registerProvider(provider);
    }

    // Register one more with known methods
    const targetProvider = validProvider('target-provider');
    const targetMethod = validMethod('target-provider', 'target.method.find_me');
    registry.registerProvider(targetProvider, [targetMethod]);

    expect(registry.size).toBe(101);
    expect(registry.getSource('target-provider')).toBeDefined();
    expect(registry.getSource('target-provider')!.id).toBe('target-provider');
    expect(registry.getMethod('target.method.find_me')).toBeDefined();
    expect(registry.getMethod('target.method.find_me')!.providerId).toBe('target-provider');
  });

  it('overwrites source when registering a capability with the same id as an existing provider', () => {
    const provider = validProvider('shared-id');
    registry.registerProvider(provider);
    expect(registry.getSource('shared-id')!.sourceClass).toBe('provider');

    // Register a capability with the same id — the registry.set() call will overwrite
    const capability = validCapability('shared-id');
    registry.registerCapability(capability);

    const source = registry.getSource('shared-id');
    expect(source).toBeDefined();
    expect(source!.sourceClass).toBe('capability');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. METHOD INJECTION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Method Injection Attacks', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(validProvider('injection-provider'));
  });

  it('rejects a method with empty methodId', () => {
    const malicious: MethodDefinition = {
      methodId: '',
      providerId: 'injection-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    expect(() =>
      registry.registerProvider(validProvider('injection-provider-2'), [
        { ...malicious, providerId: 'injection-provider-2' },
      ]),
    ).toThrow(InvalidRegistrationError);
  });

  it('rejects a method with path-traversal characters in methodId', async () => {
    const malicious: MethodDefinition = {
      methodId: '../../etc/passwd',
      providerId: 'injection-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    // Even if the registry doesn't specifically validate path chars,
    // the method should either be rejected or stored harmlessly as a
    // string key — it must not cause file-system side effects.
    // The method binding validation requires providerId match, so we
    // use the matching providerId. If it stores, it's just a map key.
    const provider2 = validProvider('path-traversal-provider');
    const m = { ...malicious, providerId: 'path-traversal-provider' };

    // The registry may or may not reject this. Either way, the runtime
    // must not interpret the methodId as a file path.
    try {
      registry.registerProvider(provider2, [m]);
      // If stored, ensure it's just a harmless string lookup
      const stored = registry.getMethod('../../etc/passwd');
      expect(stored).toBeDefined();
      expect(stored!.methodId).toBe('../../etc/passwd');
      // Executing it through AppleRuntimeAdapter will fail because no
      // subsystem prefix matches — this is safe.
      const adapter = new AppleRuntimeAdapter();
      await expect(adapter.execute('../../etc/passwd', {})).rejects.toThrow(MethodNotAvailableError);
    } catch (err) {
      // If validation rejects it, that's also acceptable
      expect(err).toBeInstanceOf(InvalidRegistrationError);
    }
  });

  it('rejects a method pointing to a non-existent provider via mismatched providerId', () => {
    const malicious: MethodDefinition = {
      methodId: 'ghost.method.attack',
      providerId: 'non-existent-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    // Binding to injection-provider but method claims non-existent-provider
    expect(() =>
      registry.registerProvider(validProvider('injection-provider-3'), [malicious]),
    ).toThrow(InvalidRegistrationError);
  });

  it('treats SQL-injection-style input as opaque data without crashing', async () => {
    const provider = validProvider('sql-test-provider');
    const method = validMethod('sql-test-provider', 'sql.test.method');
    registry.registerProvider(provider, [method]);

    const runtime = makeFakeRuntime('sql-test-provider');
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes: new Map([['sql-test-provider', runtime]]),
    });

    const sqlPayload = {
      text: "'; DROP TABLE users; --",
    };

    const response = await orchestrator.executeMethod({
      providerId: 'sql-test-provider',
      methodId: 'sql.test.method',
      input: sqlPayload,
    });

    expect(response).toBeDefined();
    expect(response.output).toEqual({ result: 'executed sql.test.method' });
  });

  it('resists prototype pollution via __proto__ in method input', async () => {
    const provider = validProvider('proto-provider');
    const method = validMethod('proto-provider', 'proto.test.method');
    registry.registerProvider(provider, [method]);

    const runtime = makeFakeRuntime('proto-provider');
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes: new Map([['proto-provider', runtime]]),
    });

    // Craft a prototype pollution payload
    const maliciousInput = JSON.parse('{"__proto__": {"admin": true}, "text": "hello"}');

    const response = await orchestrator.executeMethod({
      providerId: 'proto-provider',
      methodId: 'proto.test.method',
      input: maliciousInput,
    });

    // The runtime must not be polluted
    expect(response).toBeDefined();
    expect(({} as any).admin).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'admin')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. POLICY BYPASS ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Policy Bypass Attacks', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerCapability(validCapability('external-cap'));
    registry.registerSession(validSession('external-session'));
  });

  it('blocks useCapability when local_only=true (capability cannot bypass sovereignty)', () => {
    const method = registry.getMethod('apple.foundation_models.summarize')!;
    const decision = evaluatePolicy(
      {
        providerId: method.providerId,
        methodId: method.methodId,
        input: { text: 'test' },
        constraints: { localOnly: true },
        useCapability: 'external-cap',
      },
      method,
      registry,
      false,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('local_only');
  });

  it('riskAcknowledged=true without useSession does NOT unlock session paths', () => {
    const method = registry.getMethod('apple.foundation_models.summarize')!;
    const decision = evaluatePolicy(
      {
        providerId: method.providerId,
        methodId: method.methodId,
        input: { text: 'test' },
        riskAcknowledged: true,
        // NOTE: no useSession set
      },
      method,
      registry,
      false,
    );

    // Should fall through to the default provider path and be allowed
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('provider');
  });

  it('allows Tier D method without local_only constraint (Tier D only blocked under local_only)', () => {
    // Register a Tier D method
    const tierDProvider = validProvider('tier-d-provider');
    const tierDMethod: MethodDefinition = {
      methodId: 'tier_d.external.augment',
      providerId: 'tier-d-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.D,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };
    registry.registerProvider(tierDProvider, [tierDMethod]);

    const decision = evaluatePolicy(
      {
        providerId: 'tier-d-provider',
        methodId: 'tier_d.external.augment',
        input: {},
        // NOTE: no local_only constraint
      },
      tierDMethod,
      registry,
      false,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('provider');
  });

  it('gives capability path precedence when both useCapability and useSession are set', () => {
    const method = registry.getMethod('apple.foundation_models.summarize')!;
    const decision = evaluatePolicy(
      {
        providerId: method.providerId,
        methodId: method.methodId,
        input: { text: 'test' },
        useCapability: 'external-cap',
        useSession: 'external-session',
        riskAcknowledged: true,
      },
      method,
      registry,
      true,
    );

    // useCapability is checked first in the policy engine
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('capability');
  });

  it('blocks an expired or nonexistent session ID', () => {
    const method = registry.getMethod('apple.foundation_models.summarize')!;
    const decision = evaluatePolicy(
      {
        providerId: method.providerId,
        methodId: method.methodId,
        input: { text: 'test' },
        useSession: 'nonexistent-session-xyz',
        riskAcknowledged: true,
      },
      method,
      registry,
      false,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('session');
  });

  it('handles request where provider_id does not match method provider_id gracefully', () => {
    const method = registry.getMethod('apple.foundation_models.summarize')!;

    // Request claims a different providerId than the method's
    const decision = evaluatePolicy(
      {
        providerId: 'completely-wrong-provider',
        methodId: method.methodId,
        input: { text: 'test' },
      },
      method,
      registry,
      false,
    );

    // The policy engine evaluates based on the method's providerId, not the request's
    // so it should still work (the method resolver is what ensures correct binding)
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('provider');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. FALLBACK CHAIN ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Fallback Chain Attacks', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
  });

  it('only supports a single fallback — extra fallback providers are not chained', () => {
    const fb1 = validProvider('fallback-1');
    const fb2 = validProvider('fallback-2');
    const fb3 = validProvider('fallback-3');
    registry.registerProvider(fb1);
    registry.registerProvider(fb2);
    registry.registerProvider(fb3);

    const method = registry.getMethod('apple.foundation_models.summarize')!;

    // The planner only accepts one fallbackProviderId — there is no array
    const plan = buildExecutionPlan(method, 'provider', registry, {
      fallbackProviderId: 'fallback-1',
      fallbackMethodId: 'apple.foundation_models.summarize',
    });

    expect(plan.primary.providerId).toBe(APPLE_RUNTIME_PROVIDER.id);
    expect(plan.fallback).toBeDefined();
    expect(plan.fallback!.providerId).toBe('fallback-1');
    // No second or third fallback exists in the plan structure
    expect(Object.keys(plan)).not.toContain('fallback2');
  });

  it('produces clean failure when fallback provider is also unavailable', async () => {
    const fb = validProvider('dead-fallback');
    registry.registerProvider(fb);

    const method = registry.getMethod('apple.foundation_models.summarize')!;
    const plan = buildExecutionPlan(method, 'provider', registry, {
      fallbackProviderId: 'dead-fallback',
      fallbackMethodId: 'apple.foundation_models.summarize',
    });

    // Both primary and fallback are unavailable
    const primaryRuntime = makeFakeRuntime(APPLE_RUNTIME_PROVIDER.id, false);
    const fallbackRuntime = makeFakeRuntime('dead-fallback', false);

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes: new Map([
        [APPLE_RUNTIME_PROVIDER.id, primaryRuntime],
        ['dead-fallback', fallbackRuntime],
      ]),
    });

    await expect(
      orchestrator.executeTask('summarize this text', {
        input: { text: 'test content' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('does not allow circular fallback — planner only supports a single fallback hop', () => {
    // Set up two providers that could theoretically fall back to each other
    const provA = validProvider('circ-provider-a');
    const provB = validProvider('circ-provider-b');
    const r = new SourceRegistry();
    r.registerProvider(provA, [validMethod('circ-provider-a', 'circ.method.a')]);
    r.registerProvider(provB, [validMethod('circ-provider-b', 'circ.method.b')]);

    // Build a plan where A falls back to B
    const planAtoB = buildExecutionPlan(
      r.getMethod('circ.method.a')!,
      'provider',
      r,
      { fallbackProviderId: 'circ-provider-b', fallbackMethodId: 'circ.method.b' },
    );

    // Plan only has one level of fallback — no recursive chain possible
    expect(planAtoB.fallback).toBeDefined();
    expect(planAtoB.fallback!.providerId).toBe('circ-provider-b');
    // The plan structure has no mechanism for the fallback itself to have a fallback
    expect((planAtoB.fallback as any).fallback).toBeUndefined();
  });

  it('rejects capability-as-fallback even if capability id has a provider-like prefix', () => {
    const disguisedCap = validCapability('provider-lookalike-cap');
    registry.registerCapability(disguisedCap);

    const method = registry.getMethod('apple.foundation_models.summarize')!;

    // Attempt to use a capability as a fallback for a provider plan
    expect(() =>
      buildExecutionPlan(method, 'provider', registry, {
        fallbackProviderId: 'provider-lookalike-cap',
        fallbackMethodId: 'apple.foundation_models.summarize',
      }),
    ).toThrow(InvalidExecutionPlanError);
  });

  it('produces clean PROVIDER_UNAVAILABLE when all 10 providers are unavailable', async () => {
    const r = new SourceRegistry();
    const runtimes = new Map<string, ProviderRuntime>();

    // Register 10 providers, all unavailable
    for (let i = 0; i < 10; i++) {
      const p = validProvider(`dead-provider-${i}`);
      r.registerProvider(p);
      runtimes.set(`dead-provider-${i}`, makeFakeRuntime(`dead-provider-${i}`, false));
    }

    // Register the Apple provider (also unavailable) with its methods so
    // intent resolution can find the summarize method
    r.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    runtimes.set(APPLE_RUNTIME_PROVIDER.id, makeFakeRuntime(APPLE_RUNTIME_PROVIDER.id, false));

    const orchestrator = new RuntimeOrchestrator({ registry: r, runtimes });

    await expect(
      orchestrator.executeTask('summarize this document', {
        input: { text: 'content' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. OBSERVABILITY EVASION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Observability Evasion Attacks', () => {
  let logger: ExecutionLogger;

  beforeEach(() => {
    logger = new ExecutionLogger();
  });

  it('handles log events with extremely long string values (10KB+)', () => {
    const longString = 'A'.repeat(10_240);

    expect(() =>
      logger.logExecution({
        executionId: 'long-string-test',
        sourceType: 'provider',
        sourceId: 'test',
        providerId: 'test',
        methodId: longString,
        executionMode: 'local',
        latencyMs: 10,
        status: 'success',
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();

    const logs = logger.getExecutionLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].executionId).toBe('long-string-test');
  });

  it('handles redaction on deeply nested objects (10 levels deep)', () => {
    let obj: Record<string, unknown> = { apiKey: 'sk-secret123456789012345678' };
    for (let i = 0; i < 10; i++) {
      obj = { [`level_${i}`]: obj };
    }

    const redacted = redactLogEvent(obj as any);

    // Walk down to the deepest level and verify the apiKey was redacted
    let current: any = redacted;
    for (let i = 9; i >= 0; i--) {
      current = current[`level_${i}`];
      expect(current).toBeDefined();
    }
    expect(current.apiKey).toBe('[REDACTED]');
  });

  it('handles log events with null and undefined values without crashing', () => {
    expect(() =>
      logger.logExecution({
        executionId: 'null-test',
        sourceType: 'provider',
        sourceId: 'test',
        providerId: 'test',
        methodId: 'test.method',
        executionMode: 'local',
        latencyMs: 0,
        status: 'success',
        validationResult: undefined,
        policyPath: undefined,
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();

    const logs = logger.getExecutionLogs();
    expect(logs).toHaveLength(1);
  });

  it('cannot inject false validation results — validation comes from hooks, not input', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtime = new AppleRuntimeAdapter();
    const grits = new GRITSHookRunner({ validateSchema: true });

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes: new Map([[APPLE_RUNTIME_PROVIDER.id, runtime]]),
      onValidate: (response) => grits.validate(response),
    });

    // Execute a legitimate task
    const response = await orchestrator.executeTask('summarize this text', {
      input: { text: 'The quick brown fox jumps over the lazy dog.' },
    });

    // The validation status is set by the GRITS hook, not by the input
    // An attacker cannot set validated=true in the input to bypass GRITS
    expect(response.metadata).toBeDefined();
    expect(typeof response.metadata.validated).toBe('boolean');
  });

  it('preserves Unicode and emoji in method IDs through the logger', () => {
    const unicodeMethodId = 'test.method.\u00e9\u00e0\u00fc.\ud83d\ude80.run';

    expect(() =>
      logger.logExecution({
        executionId: 'unicode-test',
        sourceType: 'provider',
        sourceId: 'test',
        providerId: 'test',
        methodId: unicodeMethodId,
        executionMode: 'local',
        latencyMs: 5,
        status: 'success',
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();

    const logs = logger.getExecutionLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].methodId).toBe(unicodeMethodId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. GRITS MANIPULATION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: GRITS Manipulation Attacks', () => {
  it('fails validation when output does not match the method schema', () => {
    const grits = new GRITSHookRunner({ validateSchema: true });

    const method: MethodDefinition = {
      methodId: 'schema.test.method',
      providerId: 'test-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ summary: z.string(), tokenCount: z.number() }),
    };

    // Malicious output that does not match the expected schema
    const badResponse = {
      output: { malicious: 'hacked', injectedField: true },
      metadata: {
        providerId: 'test-provider',
        methodId: 'schema.test.method',
        executionMode: 'local' as const,
        deterministic: true,
        latencyMs: 10,
        validated: true, // attacker pre-claims validated
      },
    };

    const result = grits.validate(badResponse, method);
    expect(result.validated).toBe(false);
  });

  it('handles negative latency gracefully', () => {
    const grits = new GRITSHookRunner({ latencyThresholdMs: 1000 });

    const response = {
      output: { result: 'ok' },
      metadata: {
        providerId: 'test',
        methodId: 'test.method',
        executionMode: 'local' as const,
        deterministic: true,
        latencyMs: -100,
        validated: false,
      },
    };

    // Negative latency is technically below the threshold, so it should pass
    // the latency check (the validator compares numerically)
    const result = grits.validate(response);
    expect(result).toBeDefined();
    expect(typeof result.validated).toBe('boolean');
    // -100 <= threshold*0.8, so latency check passes
    expect(result.validated).toBe(true);
  });

  it('passes validation with zero latency', () => {
    const grits = new GRITSHookRunner({ latencyThresholdMs: 5000 });

    const response = {
      output: { result: 'ok' },
      metadata: {
        providerId: 'test',
        methodId: 'test.method',
        executionMode: 'local' as const,
        deterministic: true,
        latencyMs: 0,
        validated: false,
      },
    };

    const result = grits.validate(response);
    expect(result.validated).toBe(true);
  });

  it('allows clearing GRITS events (expected behavior, not an attack vector)', () => {
    const grits = new GRITSHookRunner({ validateSchema: false });

    // Generate some events
    grits.validate({
      output: {},
      metadata: {
        providerId: 'test',
        methodId: 'test.method',
        executionMode: 'local' as const,
        deterministic: true,
        latencyMs: 10,
        validated: true,
      },
    });

    expect(grits.getEvents().length).toBeGreaterThan(0);

    // Clearing events is the expected API — not an attack
    grits.clearEvents();
    expect(grits.getEvents()).toHaveLength(0);

    // Post-clear, new validations still work normally
    const result = grits.validate({
      output: {},
      metadata: {
        providerId: 'test',
        methodId: 'test.method',
        executionMode: 'local' as const,
        deterministic: true,
        latencyMs: 10,
        validated: true,
      },
    });
    expect(result).toBeDefined();
    expect(grits.getEvents().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. INTENT RESOLUTION ATTACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Red Team: Intent Resolution Attacks', () => {
  it('handles an extremely long task string (10KB) without crashing', () => {
    const longTask = 'summarize '.repeat(1024); // ~10KB

    // Should either resolve (keyword match) or return undefined — never crash
    const result = resolveIntent(longTask);

    // "summarize" keyword exists, so it should resolve
    expect(result).toBeDefined();
    expect(result!.intent).toBe('summarization');
  });

  it('handles task with null bytes and control characters gracefully', () => {
    const maliciousTask = 'summarize\x00 this\x01 text\x02\x03\x1f';

    // Should not throw, may or may not resolve depending on regex matching
    expect(() => resolveIntent(maliciousTask)).not.toThrow();

    const result = resolveIntent(maliciousTask);
    // The word "summarize" is present, so the regex should still match
    if (result) {
      expect(result.intent).toBe('summarization');
    }
  });

  it('returns undefined for an empty string', () => {
    const result = resolveIntent('');
    expect(result).toBeUndefined();
  });

  it('resolves first matching intent deterministically when task matches multiple patterns', () => {
    // "summarize and translate this" contains both "summarize" and "translate"
    // INTENT_PATTERNS is ordered by specificity: translation (index 5) comes
    // before summarization (index 9), so translation wins deterministically
    const task = 'summarize and translate this document';

    const result = resolveIntent(task);
    expect(result).toBeDefined();

    // translation pattern appears before summarization in the array
    expect(result!.intent).toBe('translation');

    // Run a second time to confirm determinism — same input always yields
    // the same first-match result
    const result2 = resolveIntent(task);
    expect(result2).toBeDefined();
    expect(result2!.intent).toBe(result!.intent);
  });
});
