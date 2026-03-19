import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { resolveMethod } from '../../../src/runtime/method-resolver.js';
import { SourceRegistry } from '../../../src/registry/registry.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import { MethodUnresolvedError } from '../../../src/domain/errors.js';
import type { ProviderDefinition, CapabilityDefinition } from '../../../src/domain/source-types.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';
import type { Intent } from '../../../src/runtime/intent-resolver.js';

const appleProvider: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple Intelligence',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

const openaiCapability: CapabilityDefinition = {
  id: 'openai-api',
  name: 'OpenAI API',
  sourceClass: 'capability',
  deterministic: false,
  explicitInvocationRequired: true,
  vendor: 'openai',
};

function makeMethod(methodId: string, subsystem: string = 'foundation_models'): MethodDefinition {
  return {
    methodId,
    providerId: 'apple-intelligence-runtime',
    subsystem: subsystem as any,
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  };
}

describe('Method Resolver', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(appleProvider, [
      makeMethod('apple.foundation_models.summarize'),
      makeMethod('apple.foundation_models.generate'),
      makeMethod('apple.foundation_models.extract'),
      makeMethod('apple.writing_tools.rewrite', 'writing_tools'),
      makeMethod('apple.writing_tools.proofread', 'writing_tools'),
      makeMethod('apple.speech.transcribe_file', 'speech'),
      makeMethod('apple.tts.render_audio', 'tts'),
      makeMethod('apple.vision.ocr', 'vision'),
      makeMethod('apple.translation.translate', 'translation'),
      makeMethod('apple.image_creator.generate', 'image_creator'),
      makeMethod('apple.sound.classify', 'sound'),
    ]);
    registry.registerCapability(openaiCapability);
  });

  it('summarization resolves to apple.foundation_models.summarize', () => {
    const { method } = resolveMethod('summarization', registry);
    expect(method.methodId).toBe('apple.foundation_models.summarize');
  });

  it('transcription resolves to apple.speech.transcribe_file', () => {
    const { method } = resolveMethod('transcription', registry);
    expect(method.methodId).toBe('apple.speech.transcribe_file');
  });

  it('speech_output resolves to apple.tts.render_audio', () => {
    const { method } = resolveMethod('speech_output', registry);
    expect(method.methodId).toBe('apple.tts.render_audio');
  });

  it('ocr resolves to apple.vision.ocr', () => {
    const { method } = resolveMethod('ocr', registry);
    expect(method.methodId).toBe('apple.vision.ocr');
  });

  it('translation resolves to apple.translation.translate', () => {
    const { method } = resolveMethod('translation', registry);
    expect(method.methodId).toBe('apple.translation.translate');
  });

  it('image_generation resolves to apple.image_creator.generate', () => {
    const { method } = resolveMethod('image_generation', registry);
    expect(method.methodId).toBe('apple.image_creator.generate');
  });

  it('sound_classification resolves to apple.sound.classify', () => {
    const { method } = resolveMethod('sound_classification', registry);
    expect(method.methodId).toBe('apple.sound.classify');
  });

  it('unsupported intent throws METHOD_UNRESOLVED', () => {
    expect(() => resolveMethod('quantum_teleportation' as Intent, registry)).toThrow(
      MethodUnresolvedError,
    );
  });

  it('explicit capability override bypasses provider default', () => {
    const { method, isOverride } = resolveMethod('summarization', registry, {
      useCapability: 'openai-api',
    });

    expect(isOverride).toBe(true);
    expect(method.providerId).toBe('openai-api');
  });

  it('capability override with non-existent capability throws MethodUnresolvedError', () => {
    expect(() =>
      resolveMethod('summarization', registry, {
        useCapability: 'nonexistent',
      }),
    ).toThrow(MethodUnresolvedError);
  });
});
