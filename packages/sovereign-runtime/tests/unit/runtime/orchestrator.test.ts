import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { RuntimeOrchestrator } from '../../../src/runtime/runtime-orchestrator.js';
import { SourceRegistry } from '../../../src/registry/registry.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import {
  MethodUnresolvedError,
  ProviderUnavailableError,
  PolicyBlockedError,
} from '../../../src/domain/errors.js';
import type { ProviderRuntime, MethodExecutionResult } from '../../../src/providers/provider-runtime.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';
import type { ProviderDefinition, CapabilityDefinition } from '../../../src/domain/source-types.js';

function makeFakeRuntime(providerId: string, available = true): ProviderRuntime {
  return {
    providerId,
    async execute(methodId: string, input: unknown): Promise<MethodExecutionResult> {
      return {
        output: { result: `executed ${methodId}`, input },
        latencyMs: 10,
        deterministic: true,
        executionMode: 'local',
      };
    },
    async isAvailable() {
      return available;
    },
    async healthCheck() {
      return { status: available ? 'healthy' : 'unavailable', latencyMs: 5 };
    },
  };
}

function makeMethod(methodId: string, subsystem: string = 'foundation_models', providerId: string = 'apple-intelligence-runtime'): MethodDefinition {
  return {
    methodId,
    providerId,
    subsystem: subsystem as any,
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  };
}

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
  name: 'OpenAI',
  sourceClass: 'capability',
  deterministic: false,
  explicitInvocationRequired: true,
  vendor: 'openai',
};

describe('Runtime Orchestrator', () => {
  let registry: SourceRegistry;
  let runtimes: Map<string, ProviderRuntime>;
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(appleProvider, [
      makeMethod('apple.foundation_models.summarize'),
      makeMethod('apple.tts.render_audio', 'tts'),
      makeMethod('apple.vision.ocr', 'vision'),
      makeMethod('apple.translation.translate', 'translation'),
    ]);
    registry.registerCapability(openaiCapability);

    runtimes = new Map();
    runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime'));

    orchestrator = new RuntimeOrchestrator({ registry, runtimes });
  });

  describe('Full pipeline — executeTask', () => {
    it('summarize text end-to-end', async () => {
      const response = await orchestrator.executeTask('summarize this document', {
        input: { text: 'Long document text...' },
      });

      expect(response.output).toBeDefined();
      expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
      expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
      expect(response.metadata.executionMode).toBe('local');
      expect(response.metadata.deterministic).toBe(true);
      expect(response.metadata.validated).toBe(true);
    });

    it('TTS artifact path', async () => {
      const response = await orchestrator.executeTask('read this report aloud', {
        input: { text: 'Report contents...' },
      });

      expect(response.metadata.methodId).toBe('apple.tts.render_audio');
      expect(response.metadata.executionMode).toBe('local');
    });

    it('OCR execution path', async () => {
      const response = await orchestrator.executeTask('extract text from this screenshot', {
        input: { imageData: 'base64...' },
      });

      expect(response.metadata.methodId).toBe('apple.vision.ocr');
    });

    it('translation path', async () => {
      const response = await orchestrator.executeTask('translate this text', {
        input: { text: 'Hello', targetLanguage: 'es' },
      });

      expect(response.metadata.methodId).toBe('apple.translation.translate');
    });

    it('uses empty object when input is omitted', async () => {
      const response = await orchestrator.executeTask('summarize this document');

      expect(response.output).toBeDefined();
      expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
    });
  });

  describe('Error handling', () => {
    it('throws METHOD_UNRESOLVED for unknown task', async () => {
      await expect(
        orchestrator.executeTask('quantum entangle these particles'),
      ).rejects.toThrow(MethodUnresolvedError);
    });

    it('throws PROVIDER_UNAVAILABLE when runtime is down', async () => {
      runtimes.set(
        'apple-intelligence-runtime',
        makeFakeRuntime('apple-intelligence-runtime', false),
      );

      await expect(
        orchestrator.executeTask('summarize this', { input: { text: 'hi' } }),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('throws PROVIDER_UNAVAILABLE when no runtime registered', async () => {
      runtimes.clear();

      await expect(
        orchestrator.executeTask('summarize this', { input: { text: 'hi' } }),
      ).rejects.toThrow(ProviderUnavailableError);
    });
  });

  describe('Policy enforcement through orchestrator', () => {
    it('blocks capability under local_only', async () => {
      await expect(
        orchestrator.executeTask('summarize this', {
          input: { text: 'hi' },
          useCapability: 'openai-api',
          constraints: { localOnly: true },
        }),
      ).rejects.toThrow(PolicyBlockedError);
    });
  });

  describe('GRITS validation hook', () => {
    it('runs validation hook and attaches result', async () => {
      const validateOrchestrator = new RuntimeOrchestrator({
        registry,
        runtimes,
        onValidate: (response) => ({
          validated: true,
          warnings: ['latency threshold approaching'],
        }),
      });

      const response = await validateOrchestrator.executeTask('summarize this', {
        input: { text: 'hi' },
      });

      expect(response.metadata.validated).toBe(true);
      expect(response.metadata.warnings).toContain('latency threshold approaching');
    });
  });

  describe('Direct method execution — executeMethod', () => {
    it('executes a method directly', async () => {
      const response = await orchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'direct call' },
      });

      expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
      expect(response.output).toBeDefined();
    });

    it('rejects unknown method', async () => {
      await expect(
        orchestrator.executeMethod({
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.vision.lidar',
          input: {},
        }),
      ).rejects.toThrow(MethodUnresolvedError);
    });

    it('throws PROVIDER_UNAVAILABLE when no runtime registered for method', async () => {
      runtimes.clear();
      await expect(
        orchestrator.executeMethod({
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.foundation_models.summarize',
          input: { text: 'test' },
        }),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('throws PROVIDER_UNAVAILABLE when runtime is down', async () => {
      runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime', false));
      await expect(
        orchestrator.executeMethod({
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.foundation_models.summarize',
          input: { text: 'test' },
        }),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('wraps non-ACDS errors as PROVIDER_UNAVAILABLE', async () => {
      const badRuntime: ProviderRuntime = {
        providerId: 'apple-intelligence-runtime',
        async execute() { throw new Error('socket hangup'); },
        async isAvailable() { return true; },
        async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
      };
      runtimes.set('apple-intelligence-runtime', badRuntime);
      await expect(
        orchestrator.executeMethod({
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.foundation_models.summarize',
          input: { text: 'test' },
        }),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('re-throws ACDSRuntimeError from execute without wrapping', async () => {
      const errorRuntime: ProviderRuntime = {
        providerId: 'apple-intelligence-runtime',
        async execute() { throw new PolicyBlockedError('blocked', {}); },
        async isAvailable() { return true; },
        async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
      };
      runtimes.set('apple-intelligence-runtime', errorRuntime);
      await expect(
        orchestrator.executeMethod({
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.foundation_models.summarize',
          input: { text: 'test' },
        }),
      ).rejects.toThrow(PolicyBlockedError);
    });

    it('runs validation hook on executeMethod response', async () => {
      const validateOrchestrator = new RuntimeOrchestrator({
        registry,
        runtimes,
        onValidate: () => ({ validated: false, warnings: ['schema drift detected'] }),
      });
      const response = await validateOrchestrator.executeMethod({
        providerId: 'apple-intelligence-runtime',
        methodId: 'apple.foundation_models.summarize',
        input: { text: 'test' },
      });
      expect(response.metadata.validated).toBe(false);
      expect(response.metadata.warnings).toContain('schema drift detected');
    });
  });

  describe('Fallback paths', () => {
    it('falls back when primary is unavailable and fallback exists', async () => {
      runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime', false));
      const fallbackProvider: ProviderDefinition = {
        id: 'fallback-provider',
        name: 'Fallback',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      registry.registerProvider(fallbackProvider, [
        makeMethod('fallback.summarize', 'foundation_models', 'fallback-provider'),
      ]);
      runtimes.set('fallback-provider', makeFakeRuntime('fallback-provider'));

      const fallbackOrchestrator = new RuntimeOrchestrator({
        registry,
        runtimes,
        fallbackMap: {
          'apple.foundation_models.summarize': {
            fallbackProviderId: 'fallback-provider',
            fallbackMethodId: 'fallback.summarize',
          },
        },
      });

      const response = await fallbackOrchestrator.executeTask('summarize this', {
        input: { text: 'test' },
      });
      expect(response.metadata.providerId).toBe('fallback-provider');
    });

    it('runs validation hook on fallback response', async () => {
      runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime', false));
      const fallbackProvider: ProviderDefinition = {
        id: 'fallback-provider',
        name: 'Fallback',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      registry.registerProvider(fallbackProvider, [
        makeMethod('fallback.summarize', 'foundation_models', 'fallback-provider'),
      ]);
      runtimes.set('fallback-provider', makeFakeRuntime('fallback-provider'));

      const fallbackOrchestrator = new RuntimeOrchestrator({
        registry,
        runtimes,
        fallbackMap: {
          'apple.foundation_models.summarize': {
            fallbackProviderId: 'fallback-provider',
            fallbackMethodId: 'fallback.summarize',
          },
        },
        onValidate: () => ({ validated: true, warnings: ['fallback used'] }),
      });

      const response = await fallbackOrchestrator.executeTask('summarize this', {
        input: { text: 'test' },
      });
      expect(response.metadata.validated).toBe(true);
      expect(response.metadata.warnings).toContain('fallback used');
    });

    it('wraps non-ACDS fallback errors as PROVIDER_UNAVAILABLE', async () => {
      runtimes.set('apple-intelligence-runtime', makeFakeRuntime('apple-intelligence-runtime', false));
      const badFallback: ProviderRuntime = {
        providerId: 'fallback-provider',
        async execute() { throw new Error('crash'); },
        async isAvailable() { return true; },
        async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
      };
      const fallbackProvider: ProviderDefinition = {
        id: 'fallback-provider',
        name: 'Fallback',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      registry.registerProvider(fallbackProvider, [
        makeMethod('fallback.summarize', 'foundation_models', 'fallback-provider'),
      ]);
      runtimes.set('fallback-provider', badFallback);

      const fallbackOrchestrator = new RuntimeOrchestrator({
        registry,
        runtimes,
        fallbackMap: {
          'apple.foundation_models.summarize': {
            fallbackProviderId: 'fallback-provider',
            fallbackMethodId: 'fallback.summarize',
          },
        },
      });

      await expect(
        fallbackOrchestrator.executeTask('summarize this', { input: { text: 'test' } }),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('wraps non-ACDS primary execute errors as PROVIDER_UNAVAILABLE', async () => {
      const badRuntime: ProviderRuntime = {
        providerId: 'apple-intelligence-runtime',
        async execute() { throw new Error('connection reset'); },
        async isAvailable() { return true; },
        async healthCheck() { return { status: 'healthy', latencyMs: 1 }; },
      };
      runtimes.set('apple-intelligence-runtime', badRuntime);
      await expect(
        orchestrator.executeTask('summarize this', { input: { text: 'test' } }),
      ).rejects.toThrow(ProviderUnavailableError);
    });
  });
});
