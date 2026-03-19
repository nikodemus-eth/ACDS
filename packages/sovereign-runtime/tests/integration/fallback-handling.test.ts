import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { PolicyBlockedError, ProviderUnavailableError } from '../../src/domain/errors.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../src/providers/provider-runtime.js';
import type { ProviderDefinition, CapabilityDefinition } from '../../src/domain/source-types.js';

describe('Integration: Fallback and Failure Handling', () => {
  it('Apple failure with no fallback returns PROVIDER_UNAVAILABLE', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const appleAdapter = new AppleRuntimeAdapter();
    appleAdapter.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleAdapter);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hello' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('cross-class fallback is never attempted', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const openaiCapability: CapabilityDefinition = {
      id: 'openai-api',
      name: 'OpenAI',
      sourceClass: 'capability',
      deterministic: false,
      explicitInvocationRequired: true,
      vendor: 'openai',
    };
    registry.registerCapability(openaiCapability);

    const appleAdapter = new AppleRuntimeAdapter();
    appleAdapter.setAvailable(false);

    // Even though a capability exists, it must not be used as fallback
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleAdapter);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    // Should fail with PROVIDER_UNAVAILABLE, not silently escalate to capability
    await expect(
      orchestrator.executeTask('summarize this text', { input: { text: 'hello' } }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('capability failure does not fall back to provider', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const openaiCapability: CapabilityDefinition = {
      id: 'openai-api',
      name: 'OpenAI',
      sourceClass: 'capability',
      deterministic: false,
      explicitInvocationRequired: true,
      vendor: 'openai',
    };
    registry.registerCapability(openaiCapability);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());
    // No runtime for openai-api

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    // Using explicit capability — should fail when capability runtime is missing
    await expect(
      orchestrator.executeTask('summarize this text', {
        input: { text: 'hello' },
        useCapability: 'openai-api',
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('local_only blocks external capability even when provider is down', async () => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    registry.registerCapability({
      id: 'openai-api',
      name: 'OpenAI',
      sourceClass: 'capability',
      deterministic: false,
      explicitInvocationRequired: true,
      vendor: 'openai',
    });

    const appleAdapter = new AppleRuntimeAdapter();
    appleAdapter.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleAdapter);

    const orchestrator = new RuntimeOrchestrator({ registry, runtimes });

    // Even with explicit capability request + local_only, blocked
    await expect(
      orchestrator.executeTask('summarize this text', {
        input: { text: 'hello' },
        useCapability: 'openai-api',
        constraints: { localOnly: true },
      }),
    ).rejects.toThrow(PolicyBlockedError);
  });
});
