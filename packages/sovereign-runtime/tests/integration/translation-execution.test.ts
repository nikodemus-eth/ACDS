import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import type { ProviderRuntime } from '../../src/providers/provider-runtime.js';

describe('Integration: Translation Execution Path', () => {
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());
    orchestrator = new RuntimeOrchestrator({ registry, runtimes });
  });

  it('translate text invokes Apple translation method', async () => {
    const response = await orchestrator.executeTask('translate this text', {
      input: { text: 'Good morning', targetLanguage: 'fr' },
    });

    expect(response.metadata.methodId).toBe('apple.translation.translate');

    const output = response.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.translatedText).toBeDefined();
    expect(output.targetLanguage).toBe('fr');
  });
});
