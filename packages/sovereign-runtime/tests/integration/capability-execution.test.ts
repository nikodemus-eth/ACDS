import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityOrchestrator } from '../../src/runtime/capability-orchestrator.js';
import { createDefaultCapabilityRegistry, APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { CAPABILITY_IDS } from '../../src/domain/capability-taxonomy.js';
import { PolicyBlockedError, MethodUnresolvedError, ProviderUnavailableError } from '../../src/domain/errors.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../src/providers/provider-runtime.js';

/**
 * Integration: Full Capability Pipeline Execution
 *
 * Exercises the CapabilityOrchestrator end-to-end, from capability request
 * through registry lookup, scoring, cost enforcement, policy evaluation,
 * and runtime execution via the Apple sovereign adapter.
 */
describe('Integration: Capability Pipeline Execution', () => {
  let orchestrator: CapabilityOrchestrator;
  let appleRuntime: AppleRuntimeAdapter;

  beforeEach(() => {
    const capabilityRegistry = createDefaultCapabilityRegistry();
    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    appleRuntime = new AppleRuntimeAdapter();
    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);

    orchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
    });
  });

  // ── Core capability execution ──

  it('text.summarize end-to-end via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'The quick brown fox jumps over the lazy dog. This is a long document about animal behavior.' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.TEXT_SUMMARIZE);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.metadata.executionMode).toBe('local');
    expect(response.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.metadata.validated).toBe(true);

    const output = response.output as { summary: string; tokenCount: number };
    expect(output.summary).toBeDefined();
    expect(typeof output.summary).toBe('string');
  });

  it('speech.transcribe via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.SPEECH_TRANSCRIBE,
      input: { audioData: 'base64-fake-audio-data', language: 'en-US' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.SPEECH_TRANSCRIBE);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');

    const output = response.output as { transcript: string; confidence: number; language: string };
    expect(output.transcript).toBeDefined();
    expect(typeof output.transcript).toBe('string');
  });

  it('speech.synthesize via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.SPEECH_SYNTHESIZE,
      input: { text: 'Hello, world!', voice: 'samantha' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.SPEECH_SYNTHESIZE);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');

    // The highest-scored TTS method may be speak (status+durationMs) or render_audio (artifactRef).
    // Both are valid TTS outputs; verify common presence of durationMs.
    const output = response.output as Record<string, unknown>;
    expect(output.durationMs).toBeDefined();
    expect(typeof output.durationMs).toBe('number');
  });

  it('image.ocr via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.IMAGE_OCR,
      input: { imageData: 'base64-fake-image-data' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.IMAGE_OCR);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');

    const output = response.output as { extractedText: string; confidence: number };
    expect(output.extractedText).toBeDefined();
    expect(typeof output.extractedText).toBe('string');
  });

  it('image.generate via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.IMAGE_GENERATE,
      input: { prompt: 'A cat sitting on a mat', style: 'illustration' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.IMAGE_GENERATE);

    const output = response.output as { artifactRef: string; format: string; width: number; height: number };
    expect(output.artifactRef).toBeDefined();
    expect(typeof output.artifactRef).toBe('string');
  });

  it('translation.translate via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TRANSLATION_TRANSLATE,
      input: { text: 'Hello world', targetLanguage: 'es', sourceLanguage: 'en' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.TRANSLATION_TRANSLATE);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');

    const output = response.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.translatedText).toBeDefined();
    expect(output.targetLanguage).toBe('es');
  });

  it('sound.classify via capability API', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.SOUND_CLASSIFY,
      input: { audioData: 'base64-fake-audio-data' },
    });

    expect(response.metadata.capabilityId).toBe(CAPABILITY_IDS.SOUND_CLASSIFY);

    const output = response.output as { events: Array<{ label: string; confidence: number }> };
    expect(output.events).toBeDefined();
    expect(Array.isArray(output.events)).toBe(true);
  });

  // ── Constraint-based routing ──

  it('text.generate with local_only constraint succeeds for Apple local provider', async () => {
    // Apple fakeGenerate expects { text: string }, matching the foundation_models input schema
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_GENERATE,
      input: { text: 'Tell me a joke' },
      constraints: { localOnly: true },
    });

    expect(response.metadata.executionMode).toBe('local');
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.decision.policyApplied).toContain('constraint:local_only');
  });

  it('request with maxLatencyMs constraint filters eligible providers', async () => {
    // Apple LOCAL_LATENCY has p95=200ms; threshold of 250ms should pass
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Some text to summarize' },
      constraints: { maxLatencyMs: 250 },
    });

    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.decision.eligibleProviders).toBeGreaterThan(0);
  });

  it('request with maxCostUSD=0 succeeds for free providers', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Some text to summarize' },
      constraints: { maxCostUSD: 0 },
    });

    expect(response.metadata.costUSD).toBe(0);
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
  });

  // ── Error paths ──

  it('request for unregistered capability throws MethodUnresolvedError', async () => {
    await expect(
      orchestrator.request({
        capability: 'nonexistent.capability',
        input: {},
      }),
    ).rejects.toThrow(MethodUnresolvedError);
  });

  it('request with sensitivity=high selects local provider', async () => {
    // Apple is local, so sensitivity=high should succeed
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Sensitive document content' },
      constraints: { sensitivity: 'high' },
    });

    expect(response.metadata.executionMode).toBe('local');
    expect(response.decision.policyApplied).toContain('sensitivity:high\u2192local_only');
  });

  // ── Fallback path ──

  it('fallback to next scored provider when primary unavailable', async () => {
    // Create a second registry with Apple + a fake "ollama" provider
    const capabilityRegistry = createDefaultCapabilityRegistry();

    // Add a fake ollama binding for text.summarize
    capabilityRegistry.bindProvider({
      capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE,
      capabilityVersion: '1.0',
      providerId: 'ollama-runtime',
      methodId: 'ollama.text.summarize',
      cost: { model: 'free', unitCost: 0, currency: 'USD' },
      latency: { p50: 100, p95: 300, p99: 600 },
      reliability: 0.85,
      locality: 'local',
    });

    const sourceRegistry = new SourceRegistry();
    sourceRegistry.registerProvider(APPLE_RUNTIME_PROVIDER, APPLE_METHODS);

    // Create a fake ollama runtime
    const ollamaRuntime: ProviderRuntime = {
      providerId: 'ollama-runtime',
      async execute(_methodId: string, _input: unknown): Promise<MethodExecutionResult> {
        return {
          output: { summary: 'Ollama fallback summary', tokenCount: 5 },
          latencyMs: 50,
          deterministic: true,
          executionMode: 'local',
        };
      },
      async isAvailable() { return true; },
      async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
    };

    // Make Apple unavailable
    appleRuntime.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set('apple-intelligence-runtime', appleRuntime);
    runtimes.set('ollama-runtime', ollamaRuntime);

    const fallbackOrchestrator = new CapabilityOrchestrator({
      capabilityRegistry,
      sourceRegistry,
      runtimes,
    });

    const response = await fallbackOrchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Text for fallback test' },
    });

    // Should have fallen back to ollama
    expect(response.metadata.providerId).toBe('ollama-runtime');
    const output = response.output as { summary: string };
    expect(output.summary).toBe('Ollama fallback summary');
  });

  // ── Decision metadata ──

  it('response includes decision metadata', async () => {
    const response = await orchestrator.request({
      capability: CAPABILITY_IDS.TEXT_SUMMARIZE,
      input: { text: 'Some text' },
      constraints: { localOnly: true },
    });

    expect(response.decision).toBeDefined();
    expect(typeof response.decision.eligibleProviders).toBe('number');
    expect(response.decision.eligibleProviders).toBeGreaterThan(0);
    expect(typeof response.decision.selectedReason).toBe('string');
    expect(response.decision.selectedReason.length).toBeGreaterThan(0);
    expect(Array.isArray(response.decision.policyApplied)).toBe(true);
    expect(typeof response.decision.fallbackAvailable).toBe('boolean');
  });
});
