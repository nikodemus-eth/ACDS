import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
} from '../../src/fixtures/provider-fixtures.js';
import { resolveIntent } from '../../src/runtime/intent-resolver.js';
import { resolveMethod } from '../../src/runtime/method-resolver.js';
import { MethodUnresolvedError } from '../../src/domain/errors.js';

describe('GRITS Routing Integrity', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  it('GRITS-ROUTE-001: "summarize this text" resolves to apple.foundation_models.summarize', () => {
    const intent = resolveIntent('summarize this text');
    expect(intent).toBeDefined();
    expect(intent!.intent).toBe('summarization');

    const { method } = resolveMethod(intent!.intent, registry);
    expect(method.methodId).toBe('apple.foundation_models.summarize');
  });

  it('GRITS-ROUTE-002: "transcribe this audio" resolves to speech transcription', () => {
    const intent = resolveIntent('transcribe this audio');
    expect(intent).toBeDefined();
    expect(intent!.intent).toBe('transcription');

    const { method } = resolveMethod(intent!.intent, registry);
    expect(method.methodId).toBe('apple.speech.transcribe_file');
  });

  it('GRITS-ROUTE-003: "read this text aloud" resolves to TTS', () => {
    const intent = resolveIntent('read this text aloud');
    expect(intent).toBeDefined();
    expect(intent!.intent).toBe('speech_output');

    const { method } = resolveMethod(intent!.intent, registry);
    expect(method.methodId).toBe('apple.tts.render_audio');
  });

  it('GRITS-ROUTE-004: explicit capability override routes to capability path only', () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);

    const intent = resolveIntent('summarize this text');
    expect(intent).toBeDefined();

    const { method, isOverride } = resolveMethod(intent!.intent, registry, {
      useCapability: FIXTURES_OPENAI_CAPABILITY.id,
    });

    expect(isOverride).toBe(true);
    expect(method.methodId).toContain('capability.');
    expect(method.methodId).toContain(FIXTURES_OPENAI_CAPABILITY.id);
  });

  it('GRITS-ROUTE-005: unknown intent fails cleanly without implicit provider selection', () => {
    const intent = resolveIntent('do something completely unrecognizable and novel');
    expect(intent).toBeUndefined();
  });

  it('GRITS-ROUTE-006: same input under same registry state resolves identically across 10 runs', () => {
    const task = 'summarize this text';
    const results: string[] = [];

    for (let i = 0; i < 10; i++) {
      const intent = resolveIntent(task);
      expect(intent).toBeDefined();
      const { method } = resolveMethod(intent!.intent, registry);
      results.push(method.methodId);
    }

    // All 10 results must be identical
    const unique = new Set(results);
    expect(unique.size).toBe(1);
    expect(results[0]).toBe('apple.foundation_models.summarize');
  });
});
