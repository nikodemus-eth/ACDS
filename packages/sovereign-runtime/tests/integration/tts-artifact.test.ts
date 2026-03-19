import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import type { ProviderRuntime } from '../../src/providers/provider-runtime.js';

describe('Integration: TTS Artifact Path', () => {
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    const registry = new SourceRegistry();
    registry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', new AppleRuntimeAdapter());
    orchestrator = new RuntimeOrchestrator({ registry, runtimes });
  });

  it('read report aloud returns audio artifact reference', async () => {
    const response = await orchestrator.executeTask('read this report aloud', {
      input: { text: 'Quarterly results show 15% growth across all segments.' },
    });

    expect(response.metadata.methodId).toBe('apple.tts.render_audio');
    expect(response.metadata.executionMode).toBe('local');

    const output = response.output as { artifactRef: string; format: string; durationMs: number; sizeBytes: number };
    expect(output.artifactRef).toMatch(/^audio:\/\//);
    expect(output.format).toBe('m4a');
    expect(output.durationMs).toBeGreaterThan(0);
    expect(output.sizeBytes).toBeGreaterThan(0);
  });
});
