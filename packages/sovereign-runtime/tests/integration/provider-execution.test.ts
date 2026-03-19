import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import type { ProviderRuntime } from '../../src/providers/provider-runtime.js';

describe('Integration: Full Provider Execution Path', () => {
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());

    orchestrator = new RuntimeOrchestrator({ registry, runtimes });
  });

  it('summarize text end-to-end through full pipeline', async () => {
    const response = await orchestrator.executeTask('summarize this document', {
      input: { text: 'The quick brown fox jumps over the lazy dog. This document describes animal behavior in agricultural settings.' },
    });

    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
    expect(response.metadata.executionMode).toBe('local');
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.latencyMs).toBeGreaterThanOrEqual(0);

    const output = response.output as { summary: string; tokenCount: number };
    expect(output.summary).toBeDefined();
    expect(output.tokenCount).toBeGreaterThan(0);
  });

  it('text generation through full pipeline', async () => {
    const response = await orchestrator.executeTask('generate text about cats', {
      input: { text: 'Write about cats' },
    });

    expect(response.metadata.methodId).toBe('apple.foundation_models.generate');
    const output = response.output as { generatedText: string };
    expect(output.generatedText).toBeDefined();
  });
});
