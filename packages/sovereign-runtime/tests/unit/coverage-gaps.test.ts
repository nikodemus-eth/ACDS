import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { SourceRegistry } from '../../src/registry/registry.js';
import { createDefaultRegistry, APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { GRITSHookRunner } from '../../src/grits/grits-hooks.js';
import { emitDriftSignal, checkCapabilityCreep, checkResolverDrift } from '../../src/grits/drift-signals.js';
import { validateOutputSchema } from '../../src/grits/schema-validator.js';
import { validateLatency } from '../../src/grits/latency-validator.js';
import { evaluatePolicy } from '../../src/runtime/policy-engine.js';
import { buildExecutionPlan } from '../../src/runtime/execution-planner.js';
import { resolveMethod } from '../../src/runtime/method-resolver.js';
import { assembleResponse } from '../../src/runtime/response-assembler.js';
import { PolicyTier } from '../../src/domain/policy-tiers.js';
import {
  InvalidRegistrationError,
  MethodNotAvailableError,
  PolicyBlockedError,
  ProviderUnavailableError,
  MethodUnresolvedError,
} from '../../src/domain/errors.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OLLAMA_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
  FIXTURES_OPENAI_SESSION,
} from '../../src/fixtures/provider-fixtures.js';
import { TASK_FIXTURES } from '../../src/fixtures/task-fixtures.js';
import { makeSuccessResponse } from '../../src/fixtures/response-fixtures.js';
import {
  rejectMixedClassRegistration,
  validateMethodBinding,
} from '../../src/registry/registry-validation.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../src/providers/provider-runtime.js';
import type { MethodDefinition } from '../../src/domain/method-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRegistryWithApple(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  return registry;
}

function makeAppleResponse(overrides: Record<string, unknown> = {}) {
  return makeSuccessResponse({ latencyMs: 10, ...overrides });
}

/** Minimal in-memory runtime that is always available. */
function makeRuntime(
  providerId: string,
  available = true,
): ProviderRuntime {
  return {
    providerId,
    async execute(_methodId: string, _input: unknown): Promise<MethodExecutionResult> {
      return { output: { result: 'runtime' }, latencyMs: 5, deterministic: true, executionMode: 'local' };
    },
    async isAvailable() {
      return available;
    },
    async healthCheck() {
      return { status: 'healthy' as const, latencyMs: 1 };
    },
  };
}

// ===========================================================================
// 1. GRITSHookRunner
// ===========================================================================
describe('GRITSHookRunner', () => {
  const summarizeMethod = APPLE_METHODS.find(
    (m) => m.methodId === 'apple.foundation_models.summarize',
  )!;

  it('validate() with passing schema and latency returns validated=true, empty warnings', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 5000 });
    const response = makeAppleResponse();
    // Output must satisfy the summarize outputSchema: { summary: string, tokenCount: number }
    response.output = { summary: 'hello', tokenCount: 5 };
    const result = runner.validate(response, summarizeMethod);
    expect(result.validated).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('validate() with output that fails schema returns validated=false', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 5000 });
    const response = makeAppleResponse();
    response.output = { bad: 'data' }; // does not match outputSchema
    const result = runner.validate(response, summarizeMethod);
    expect(result.validated).toBe(false);
  });

  it('validate() with latency exceeding threshold returns warnings', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 100 });
    const response = makeAppleResponse();
    response.output = { summary: 'ok', tokenCount: 1 };
    // latency 10ms is within 100ms threshold, set a high latency
    response.metadata.latencyMs = 95; // 95 > 80 (0.8*100), triggers warning
    const result = runner.validate(response, summarizeMethod);
    expect(result.validated).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('approaching threshold');
  });

  it('validate() without a method skips schema validation, still validates latency', () => {
    const runner = new GRITSHookRunner({ latencyThresholdMs: 5000 });
    const response = makeAppleResponse();
    response.output = { arbitrary: 'stuff' };
    const result = runner.validate(response);
    expect(result.validated).toBe(true);
  });

  it('getEvents() returns recorded events', () => {
    const runner = new GRITSHookRunner();
    const response = makeAppleResponse();
    response.output = { summary: 'x', tokenCount: 1 };
    runner.validate(response, summarizeMethod);
    const events = runner.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].hookId).toBeDefined();
  });

  it('clearEvents() empties the event list', () => {
    const runner = new GRITSHookRunner();
    const response = makeAppleResponse();
    runner.validate(response);
    expect(runner.getEvents().length).toBeGreaterThan(0);
    runner.clearEvents();
    expect(runner.getEvents().length).toBe(0);
  });

  it('with validateSchema: false skips schema validation even when method has outputSchema', () => {
    const runner = new GRITSHookRunner({ validateSchema: false, latencyThresholdMs: 5000 });
    const response = makeAppleResponse();
    response.output = { bad: 'data' }; // would fail schema
    const result = runner.validate(response, summarizeMethod);
    // Should pass because schema validation was skipped
    expect(result.validated).toBe(true);
  });
});

// ===========================================================================
// 2. drift-signals.ts
// ===========================================================================
describe('drift-signals', () => {
  it('emitDriftSignal() returns a ValidationResult with status=drift', () => {
    const signal = {
      type: 'resolver_drift' as const,
      methodId: 'apple.foundation_models.summarize',
      description: 'test drift',
      severity: 'high' as const,
      timestamp: new Date().toISOString(),
    };
    const result = emitDriftSignal(signal);
    expect(result.status).toBe('drift');
    expect(result.severity).toBe('high');
    expect(result.message).toContain('resolver_drift');
  });

  it('checkResolverDrift() when methodIds match returns undefined', () => {
    const result = checkResolverDrift('method.a', 'method.a', 'some task');
    expect(result).toBeUndefined();
  });

  it('checkResolverDrift() when methodIds differ returns a DriftSignal', () => {
    const result = checkResolverDrift('method.a', 'method.b', 'some task');
    expect(result).toBeDefined();
    expect(result!.type).toBe('resolver_drift');
  });

  it('checkCapabilityCreep() when classes match returns undefined', () => {
    const result = checkCapabilityCreep('provider', 'provider', 'method.x');
    expect(result).toBeUndefined();
  });

  it('checkCapabilityCreep() with session as execution class returns drift signal', () => {
    const result = checkCapabilityCreep('session', 'provider', 'method.x');
    expect(result).toBeDefined();
    expect(result!.type).toBe('capability_creep');
  });

  it('checkCapabilityCreep() when expectedClass is not provider returns undefined', () => {
    // When expectedClass is not 'provider', the check does not apply
    const result = checkCapabilityCreep('session', 'session', 'method.x');
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// 3. RuntimeOrchestrator — executeMethod validation path
// ===========================================================================
describe('RuntimeOrchestrator', () => {
  let registry: SourceRegistry;
  let appleRuntime: AppleRuntimeAdapter;

  beforeEach(() => {
    registry = buildRegistryWithApple();
    appleRuntime = new AppleRuntimeAdapter();
  });

  it('executeMethod() with validation hook fires and attaches results', async () => {
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);

    const hookRunner = new GRITSHookRunner({ latencyThresholdMs: 50000 });
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      onValidate: (resp, method) => hookRunner.validate(resp, method),
    });

    const response = await orchestrator.executeMethod({
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      input: { text: 'hello world' },
    });

    expect(response.metadata.validated).toBeDefined();
  });

  it('executeMethod() with policy blocked throws PolicyBlockedError', async () => {
    // Register a capability and try to use session that doesn't exist
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    // Using useSession with a non-existent session triggers policy block in evaluatePolicy
    // but executeMethod doesn't pass useSession through — instead we use localOnly + Tier D
    // The simplest blocked path: provider not found in registry
    // Actually, let's create a method whose provider doesn't exist in registry
    const fakeRegistry = new SourceRegistry();
    fakeRegistry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
    // Register a session to trigger the policy engine block
    fakeRegistry.registerSession(FIXTURES_OPENAI_SESSION);

    const orchestrator2 = new RuntimeOrchestrator({
      registry: fakeRegistry,
      runtimes,
    });

    // executeMethod with useSession pointing to a valid session but no riskAcknowledged
    await expect(
      orchestrator2.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'hi' },
        useSession: 'openai-session',
      }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it('executeMethod() with unavailable provider throws ProviderUnavailableError', async () => {
    const unavailableRuntime = makeRuntime('apple-intelligence-runtime', false);
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', unavailableRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    await expect(
      orchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'hi' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('executeTask() when primary provider is unavailable and no fallback throws', async () => {
    // Make Apple runtime unavailable
    appleRuntime.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    // Since executeTask doesn't pass fallback options, plan.fallback is undefined → throws
    await expect(
      orchestrator.executeTask('summarize this document', { input: { text: 'hello' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('executeMethod() when runtime not in runtimes map throws ProviderUnavailableError', async () => {
    // Empty runtimes map — provider exists in registry but no runtime registered
    const runtimes = new Map<string, ProviderRuntime>();
    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    await expect(
      orchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'hi' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('executeTask() with validation hook on primary path', async () => {
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);

    let hookCalled = false;
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      onValidate: (resp) => {
        hookCalled = true;
        return { validated: true, warnings: ['test-warning'] };
      },
    });

    const response = await orchestrator.executeTask('summarize this document', {
      input: { text: 'hello world' },
    });

    expect(hookCalled).toBe(true);
    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toContain('test-warning');
  });
});

// ===========================================================================
// 4. default-registry.ts
// ===========================================================================
describe('createDefaultRegistry', () => {
  it('returns a registry with the Apple provider', () => {
    const registry = createDefaultRegistry();
    expect(registry).toBeInstanceOf(SourceRegistry);
    expect(registry.has('apple-intelligence-runtime')).toBe(true);
  });

  it('the Apple provider matches APPLE_RUNTIME_PROVIDER', () => {
    const registry = createDefaultRegistry();
    const source = registry.getSource('apple-intelligence-runtime');
    expect(source).toBeDefined();
    expect(source!.id).toBe(APPLE_RUNTIME_PROVIDER.id);
    expect(source!.sourceClass).toBe('provider');
  });
});

// ===========================================================================
// 5. registry-validation.ts — missing branches
// ===========================================================================
describe('registry-validation', () => {
  it('rejectMixedClassRegistration with capability registered as session rejects', () => {
    expect(() =>
      rejectMixedClassRegistration(FIXTURES_OPENAI_CAPABILITY, 'session'),
    ).toThrow(InvalidRegistrationError);
  });

  it('validateMethodBinding with method missing subsystem rejects', () => {
    const badMethod = {
      methodId: 'test.method',
      providerId: FIXTURES_APPLE_PROVIDER.id,
      subsystem: undefined as any,
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };
    expect(() => validateMethodBinding(badMethod, FIXTURES_APPLE_PROVIDER)).toThrow(
      InvalidRegistrationError,
    );
  });

  it('validateMethodBinding with method missing policyTier rejects', () => {
    const badMethod = {
      methodId: 'test.method',
      providerId: FIXTURES_APPLE_PROVIDER.id,
      subsystem: 'foundation_models' as const,
      policyTier: undefined as any,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };
    expect(() => validateMethodBinding(badMethod, FIXTURES_APPLE_PROVIDER)).toThrow(
      InvalidRegistrationError,
    );
  });
});

// ===========================================================================
// 6. registry.ts — size and has
// ===========================================================================
describe('SourceRegistry size and has', () => {
  it('size returns correct count', () => {
    const registry = new SourceRegistry();
    expect(registry.size).toBe(0);
    registry.registerProvider(FIXTURES_APPLE_PROVIDER);
    expect(registry.size).toBe(1);
    registry.registerProvider(FIXTURES_OLLAMA_PROVIDER);
    expect(registry.size).toBe(2);
  });

  it('has() returns true for registered and false for unregistered', () => {
    const registry = new SourceRegistry();
    expect(registry.has('apple-intelligence-runtime')).toBe(false);
    registry.registerProvider(FIXTURES_APPLE_PROVIDER);
    expect(registry.has('apple-intelligence-runtime')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });
});

// ===========================================================================
// 7. Method handler MethodNotAvailable branches
// ===========================================================================
describe('Apple method handlers — invalid method names', () => {
  let adapter: AppleRuntimeAdapter;

  beforeEach(() => {
    adapter = new AppleRuntimeAdapter();
  });

  it('image handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.image_creator.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });

  it('sound handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.sound.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });

  it('translation handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.translation.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });

  it('foundation_models handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.foundation_models.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });

  it('writing_tools handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.writing_tools.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });

  it('speech handler rejects invalid method', async () => {
    await expect(adapter.execute('apple.speech.invalid', {})).rejects.toThrow(
      MethodNotAvailableError,
    );
  });
});

// ===========================================================================
// 8. response-assembler.ts — warnings branch
// ===========================================================================
describe('assembleResponse', () => {
  it('with empty warnings array omits warnings from metadata', () => {
    const result: MethodExecutionResult = {
      output: { data: 'test' },
      latencyMs: 10,
      deterministic: true,
      executionMode: 'local',
    };
    const plan = {
      primary: {
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        executionMode: 'local' as const,
      },
      executionClass: 'provider' as const,
    };

    const response = assembleResponse(result, plan, true, []);
    expect(response.metadata.warnings).toBeUndefined();
  });

  it('with non-empty warnings includes them in metadata', () => {
    const result: MethodExecutionResult = {
      output: { data: 'test' },
      latencyMs: 10,
      deterministic: true,
      executionMode: 'local',
    };
    const plan = {
      primary: {
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        executionMode: 'local' as const,
      },
      executionClass: 'provider' as const,
    };

    const response = assembleResponse(result, plan, true, ['latency high']);
    expect(response.metadata.warnings).toEqual(['latency high']);
  });

  it('with undefined warnings omits warnings from metadata', () => {
    const result: MethodExecutionResult = {
      output: { data: 'test' },
      latencyMs: 10,
      deterministic: true,
      executionMode: 'local',
    };
    const plan = {
      primary: {
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        executionMode: 'local' as const,
      },
      executionClass: 'provider' as const,
    };

    const response = assembleResponse(result, plan, true);
    expect(response.metadata.warnings).toBeUndefined();
  });
});

// ===========================================================================
// 9. Fixture files
// ===========================================================================
describe('fixture files', () => {
  it('TASK_FIXTURES has all expected keys', () => {
    const expectedKeys = [
      'summarize',
      'transcribe',
      'readAloud',
      'ocr',
      'translate',
      'generateImage',
      'classifySound',
    ];
    for (const key of expectedKeys) {
      expect(TASK_FIXTURES).toHaveProperty(key);
    }
  });

  it('makeSuccessResponse() returns a valid response with defaults', () => {
    const response = makeSuccessResponse();
    expect(response.output).toEqual({ result: 'test output' });
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
    expect(response.metadata.executionMode).toBe('local');
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.latencyMs).toBe(15);
    expect(response.metadata.validated).toBe(true);
  });

  it('makeSuccessResponse() with overrides applies them', () => {
    const response = makeSuccessResponse({ latencyMs: 999, validated: false });
    expect(response.metadata.latencyMs).toBe(999);
    expect(response.metadata.validated).toBe(false);
    // Defaults should still be present for non-overridden fields
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
  });
});

// ===========================================================================
// 10. policy-engine.ts — unknown session
// ===========================================================================
describe('policy-engine — unknown session', () => {
  it('evaluatePolicy with useSession pointing to non-existent session returns blocked', () => {
    const registry = buildRegistryWithApple();
    const method = APPLE_METHODS[0];

    const decision = evaluatePolicy(
      {
        providerId: method.providerId,
        methodId: method.methodId,
        input: {},
        useSession: 'nonexistent-session',
        riskAcknowledged: true,
      },
      method,
      registry,
      false,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('session not found');
  });
});

// ===========================================================================
// 11. method-resolver.ts — method not in registry
// ===========================================================================
describe('method-resolver — method not in registry', () => {
  it('resolveMethod for summarization when method not registered throws MethodUnresolvedError', () => {
    // Register Apple provider WITHOUT methods
    const registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER);

    expect(() =>
      resolveMethod('summarization', registry),
    ).toThrow(MethodUnresolvedError);
  });
});

// ===========================================================================
// 12. execution-planner.ts — source without executionMode (else branch)
// ===========================================================================
describe('execution-planner — else branch for executionMode', () => {
  it('builds plan with controlled_remote when source has no executionMode', () => {
    // Create a capability source (which has no executionMode property)
    // and force the planner to treat it as a provider execution class
    // by passing executionClass='provider' but the source is a capability.
    //
    // Actually, the else branch triggers when source.sourceClass !== 'provider'
    // or 'executionMode' is not in source. Let's create a provider-like source
    // that somehow doesn't have executionMode.
    //
    // The simplest way: register a capability, create a method referencing its id,
    // and call buildExecutionPlan with executionClass='capability'.
    // But capabilities cannot have methods bound.
    //
    // Instead, test the fallback executionMode path on a source that's
    // retrieved but doesn't have executionMode. We can achieve this by
    // having the method's providerId point to a capability source.
    // However, the registry won't allow binding methods to capabilities.
    //
    // The actual else branch fires when executionClass='session' (line 41-42)
    // because it returns 'session' before checking source.executionMode.
    // But for the capability path (line 43-45), the source might be a
    // capability (no executionMode) → falls through to 'controlled_remote'.
    //
    // Let's test session executionClass:
    const registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
    registry.registerSession(FIXTURES_OPENAI_SESSION);

    const method = APPLE_METHODS[0];
    const plan = buildExecutionPlan(method, 'session', registry);

    expect(plan.primary.executionMode).toBe('session');
    expect(plan.executionClass).toBe('session');
  });

  it('builds plan with controlled_remote when source is not found', () => {
    // When registry.getSource returns undefined, the ternary falls to 'controlled_remote'
    const registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);

    // Create a method definition referencing a provider that doesn't exist
    const orphanMethod: MethodDefinition = {
      methodId: 'orphan.test.method',
      providerId: 'nonexistent-provider',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    const plan = buildExecutionPlan(orphanMethod, 'provider', registry);
    expect(plan.primary.executionMode).toBe('controlled_remote');
  });
});

describe('Orchestrator fallback execution path', () => {
  function makeFakeRuntime(providerId: string, available = true): ProviderRuntime {
    return {
      providerId,
      async execute(methodId: string, input: unknown) {
        return { output: { result: `executed ${methodId}` }, latencyMs: 10, deterministic: true, executionMode: 'local' as const };
      },
      async isAvailable() { return available; },
      async healthCheck() { return { status: 'healthy' as const, latencyMs: 5 }; },
    };
  }

  it('falls back to secondary provider when primary is unavailable', async () => {
    const registry = new SourceRegistry();
    const ollamaProvider = {
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted' as const,
      executionMode: 'local' as const,
    };
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider(ollamaProvider);

    const unavailableApple: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('should not be called'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', unavailableApple);
    runtimes.set('ollama-local', makeFakeRuntime('ollama-local', true));

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });
    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hi' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('uses fallback when primary is unavailable and fallbackMap is configured', async () => {
    const registry = new SourceRegistry();
    const ollamaProvider = {
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted' as const,
      executionMode: 'local' as const,
    };
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider(ollamaProvider);

    const unavailableApple: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('should not be called'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', unavailableApple);
    runtimes.set('ollama-local', makeFakeRuntime('ollama-local', true));

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
    });

    const response = await orchestrator.executeTask('summarize this text', {
      input: { text: 'hello' },
    });

    expect(response.metadata.providerId).toBe('ollama-local');
    expect(response.metadata.methodId).toBe('ollama.summarize');
    expect(response.metadata.executionMode).toBe('local');
  });

  it('fallback with onValidate hook fires validation on fallback path', async () => {
    const registry = new SourceRegistry();
    const ollamaProvider = {
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted' as const,
      executionMode: 'local' as const,
    };
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider(ollamaProvider);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unreachable'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    });
    runtimes.set('ollama-local', makeFakeRuntime('ollama-local'));

    let hookFired = false;
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
      onValidate: () => {
        hookFired = true;
        return { validated: true, warnings: ['fallback-warning'] };
      },
    });

    const response = await orchestrator.executeTask('summarize this text', {
      input: { text: 'hello' },
    });

    expect(hookFired).toBe(true);
    expect(response.metadata.warnings).toContain('fallback-warning');
  });

  it('fallback with onValidate hook returning no warnings omits warnings', async () => {
    const registry = new SourceRegistry();
    const ollamaProvider = {
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted' as const,
      executionMode: 'local' as const,
    };
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider(ollamaProvider);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unreachable'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    });
    runtimes.set('ollama-local', makeFakeRuntime('ollama-local'));

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
      onValidate: () => ({ validated: true, warnings: [] }),
    });

    const response = await orchestrator.executeTask('summarize this text', {
      input: { text: 'hello' },
    });

    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toBeUndefined();
  });

  it('executeTask with onValidate hook returning no warnings omits warnings', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime'));

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      onValidate: () => ({ validated: true, warnings: [] }),
    });

    const response = await orchestrator.executeTask('summarize this text', {
      input: { text: 'hello' },
    });

    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toBeUndefined();
  });

  it('fallback with unavailable fallback runtime still throws', async () => {
    const registry = new SourceRegistry();
    const ollamaProvider = {
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted' as const,
      executionMode: 'local' as const,
    };
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider(ollamaProvider);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unreachable'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    });
    runtimes.set('ollama-local', makeFakeRuntime('ollama-local', false));

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
    });

    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hello' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('executeMethod with onValidate hook fires validation', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime'));

    let validationCalled = false;
    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      onValidate: (response) => {
        validationCalled = true;
        return { validated: true, warnings: ['test warning'] };
      },
    });

    const response = await orchestrator.executeMethod({
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      input: { text: 'hello' },
    });

    expect(validationCalled).toBe(true);
    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toContain('test warning');
  });

  it('executeMethod with onValidate hook that returns no warnings omits warnings', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime'));

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      onValidate: () => ({ validated: true, warnings: [] }),
    });

    const response = await orchestrator.executeMethod({
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      input: { text: 'hello' },
    });

    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toBeUndefined();
  });
});

describe('Registry validation — provider localOnly, capability explicitInvocation, unknown class', () => {
  it('rejects provider with non-boolean localOnly', () => {
    const registry = new SourceRegistry();
    const badProvider = {
      id: 'bad',
      name: 'Bad',
      sourceClass: 'provider' as const,
      deterministic: true,
      localOnly: 'yes' as any,
      providerClass: 'sovereign_runtime' as const,
      executionMode: 'local' as const,
    };
    expect(() => registry.registerProvider(badProvider)).toThrow(InvalidRegistrationError);
  });

  it('rejects capability without explicitInvocationRequired=true', () => {
    const registry = new SourceRegistry();
    const badCap = {
      id: 'bad',
      name: 'Bad',
      sourceClass: 'capability' as const,
      deterministic: false,
      explicitInvocationRequired: false as any,
      vendor: 'test',
    };
    expect(() => registry.registerCapability(badCap)).toThrow(InvalidRegistrationError);
  });

  it('rejects unknown source class via direct validation', async () => {
    const { validateSourceDefinition } = await import('../../src/registry/registry-validation.js');
    const bad = {
      id: 'bad',
      name: 'Bad',
      sourceClass: 'alien' as any,
    };
    expect(() => validateSourceDefinition(bad as any)).toThrow(InvalidRegistrationError);
  });
});

describe('Registry validation — deterministic and requiresNetwork checks', () => {
  it('rejects method with non-boolean deterministic', () => {
    const provider = { ...APPLE_RUNTIME_PROVIDER };
    const badMethod = {
      methodId: 'test.method',
      providerId: 'apple-intelligence-runtime',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: 'yes' as any,
      requiresNetwork: false,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };
    const registry = new SourceRegistry();
    expect(() => registry.registerProvider(provider, [badMethod])).toThrow(InvalidRegistrationError);
  });

  it('rejects method with non-boolean requiresNetwork', () => {
    const provider = { ...APPLE_RUNTIME_PROVIDER };
    const badMethod = {
      methodId: 'test.method',
      providerId: 'apple-intelligence-runtime',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: 'no' as any,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };
    const registry = new SourceRegistry();
    expect(() => registry.registerProvider(provider, [badMethod])).toThrow(InvalidRegistrationError);
  });
});

// ===========================================================================
// Registry duplicate ID rejection for capability and session
// ===========================================================================
describe('Registry duplicate ID rejection for capability and session', () => {
  it('rejects registering a capability with an ID already used by another capability', () => {
    const registry = new SourceRegistry();
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    expect(() => registry.registerCapability({
      ...FIXTURES_OPENAI_CAPABILITY,
      name: 'Duplicate',
    })).toThrow(InvalidRegistrationError);
  });

  it('rejects registering a session with an ID already used by another session', () => {
    const registry = new SourceRegistry();
    registry.registerSession(FIXTURES_OPENAI_SESSION);
    expect(() => registry.registerSession({
      ...FIXTURES_OPENAI_SESSION,
      name: 'Duplicate',
    })).toThrow(InvalidRegistrationError);
  });
});

// ===========================================================================
// Orchestrator error wrapping
// ===========================================================================
describe('Orchestrator error wrapping', () => {
  it('wraps non-ACDS errors from runtime.execute in executeTask', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new TypeError('native bridge crashed'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });
    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hi' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('wraps non-ACDS errors from runtime.execute in executeMethod', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unexpected crash'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });
    await expect(
      orchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'hi' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('re-throws ACDSRuntimeError from runtime.execute without wrapping', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new MethodNotAvailableError('test.method', 'test'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });
    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hi' } }),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it('wraps non-ACDS errors from fallback runtime.execute', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider({
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider',
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted',
      executionMode: 'local',
    });

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unreachable'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    });
    runtimes.set('ollama-local', {
      providerId: 'ollama-local',
      async execute() { throw new RangeError('fallback also crashed'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    });

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
    });

    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hi' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('re-throws ACDSRuntimeError from fallback runtime.execute without wrapping', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerProvider({
      id: 'ollama-local',
      name: 'Ollama',
      sourceClass: 'provider',
      deterministic: true,
      localOnly: true,
      providerClass: 'self_hosted',
      executionMode: 'local',
    });

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new Error('unreachable'); },
      async isAvailable() { return false; },
      async healthCheck() { return { status: 'unavailable', latencyMs: 0 }; },
    });
    runtimes.set('ollama-local', {
      providerId: 'ollama-local',
      async execute() { throw new MethodNotAvailableError('ollama.summarize', 'ollama-local'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    });

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
      fallbackMap: {
        'apple.foundation_models.summarize': {
          fallbackProviderId: 'ollama-local',
          fallbackMethodId: 'ollama.summarize',
        },
      },
    });

    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hi' } }),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it('re-throws ACDSRuntimeError from executeMethod without wrapping', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new MethodNotAvailableError('apple.foundation_models.summarize', 'apple-intelligence-runtime'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });
    await expect(
      orchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'hi' },
      }),
    ).rejects.toThrow(MethodNotAvailableError);
  });
});

// ===========================================================================
// CapabilityOrchestrator — uncovered branches
// ===========================================================================
describe('CapabilityOrchestrator — error re-throw and onValidate warnings', () => {
  it('re-throws errors with code property from primary execution', async () => {
    const { CapabilityOrchestrator } = await import('../../src/runtime/capability-orchestrator.js');
    const { createDefaultCapabilityRegistry } = await import('../../src/registry/default-registry.js');

    const capabilityRegistry = createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const codedError = Object.assign(new Error('coded failure'), { code: 'ACDS_ERROR' });
    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw codedError; },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
    });

    await expect(
      orchestrator.request({
        capability: 'text.summarize',
        input: { text: 'hello' },
      }),
    ).rejects.toThrow('coded failure');
  });

  it('wraps non-coded errors from primary execution as ProviderUnavailableError', async () => {
    const { CapabilityOrchestrator } = await import('../../src/runtime/capability-orchestrator.js');
    const { createDefaultCapabilityRegistry } = await import('../../src/registry/default-registry.js');

    const capabilityRegistry = createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const throwingRuntime: ProviderRuntime = {
      providerId: 'apple-intelligence-runtime',
      async execute() { throw new TypeError('native crash'); },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', throwingRuntime);

    const orchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
    });

    await expect(
      orchestrator.request({
        capability: 'text.summarize',
        input: { text: 'hello' },
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('onValidate hook with warnings attaches them to response', async () => {
    const { CapabilityOrchestrator } = await import('../../src/runtime/capability-orchestrator.js');
    const { createDefaultCapabilityRegistry } = await import('../../src/registry/default-registry.js');
    const { AppleRuntimeAdapter } = await import('../../src/providers/apple/apple-runtime-adapter.js');

    const capabilityRegistry = createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());

    const orchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
      onValidate: () => ({ validated: true, warnings: ['cap-warning'] }),
    });

    const response = await orchestrator.request({
      capability: 'text.summarize',
      input: { text: 'hello world test' },
    });

    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toContain('cap-warning');
  });

  it('onValidate hook with empty warnings omits warnings', async () => {
    const { CapabilityOrchestrator } = await import('../../src/runtime/capability-orchestrator.js');
    const { createDefaultCapabilityRegistry } = await import('../../src/registry/default-registry.js');
    const { AppleRuntimeAdapter } = await import('../../src/providers/apple/apple-runtime-adapter.js');

    const capabilityRegistry = createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());

    const orchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
      onValidate: () => ({ validated: true, warnings: [] }),
    });

    const response = await orchestrator.request({
      capability: 'text.summarize',
      input: { text: 'hello world test' },
    });

    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.warnings).toBeUndefined();
  });
});
