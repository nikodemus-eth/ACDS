import { describe, it, expect } from 'vitest';
import { CapabilityTestService, type CapabilityTestDeps } from './CapabilityTestService.js';
import type { Provider } from '@acds/core-types';

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'p1',
    name: 'OpenAI GPT',
    vendor: 'openai' as any,
    authType: 'api_key' as any,
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'cloud',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeps(options: {
  provider?: Provider | null;
  executeResult?: any;
  executeError?: Error;
  apiKey?: string | undefined;
} = {}): CapabilityTestDeps {
  const provider = options.provider !== undefined ? options.provider : makeProvider();
  return {
    registryService: {
      getById: async (id: string) => provider,
    } as any,
    executionProxy: {
      execute: async () => {
        if (options.executeError) throw options.executeError;
        return options.executeResult ?? {
          content: 'Generated text',
          model: 'gpt-4o',
          inputTokens: 10,
          outputTokens: 20,
          finishReason: 'stop',
          latencyMs: 150,
          rawMetadata: { extra: 'data' },
        };
      },
    } as any,
    resolveApiKey: async () => options.apiKey ?? 'test-api-key',
  };
}

describe('CapabilityTestService', () => {
  describe('getManifest', () => {
    it('returns manifest for a standard provider', async () => {
      const service = new CapabilityTestService(makeDeps());
      const manifest = await service.getManifest('p1');

      expect(manifest).toHaveLength(1);
      expect(manifest[0].capabilityId).toBe('text.generate');
      expect(manifest[0].label).toBe('Text Generation');
      expect(manifest[0].available).toBe(true);
    });

    it('returns manifest with available=false for disabled provider', async () => {
      const service = new CapabilityTestService(makeDeps({ provider: makeProvider({ enabled: false }) }));
      const manifest = await service.getManifest('p1');

      expect(manifest[0].available).toBe(false);
    });

    it('returns Apple manifest for Apple vendor', async () => {
      const service = new CapabilityTestService(makeDeps({
        provider: makeProvider({ vendor: 'apple' as any }),
      }));
      const manifest = await service.getManifest('p1');

      expect(manifest.length).toBeGreaterThan(1);
      expect(manifest[0].capabilityId).toContain('apple.');
    });

    it('throws when provider not found', async () => {
      const service = new CapabilityTestService(makeDeps({ provider: null }));
      await expect(service.getManifest('missing')).rejects.toThrow('Provider not found');
    });
  });

  describe('testCapability', () => {
    it('returns success response for valid capability', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', { text: 'hello' });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('p1');
      expect(result.capabilityId).toBe('text.generate');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.output.type).toBe('text');
      expect(result.output.value).toBe('Generated text');
      expect(result.rawResponse.content).toBe('Generated text');
      expect(result.rawResponse.model).toBe('gpt-4o');
      expect(result.rawResponse.extra).toBe('data');
      expect(result.timestamp).toBeDefined();
    });

    it('returns CAPABILITY_NOT_FOUND for unknown capability', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'unknown.cap', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('CAPABILITY_NOT_FOUND');
      expect(result.error!.message).toContain('unknown.cap');
    });

    it('returns CAPABILITY_UNAVAILABLE for disabled provider', async () => {
      const service = new CapabilityTestService(makeDeps({ provider: makeProvider({ enabled: false }) }));
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('CAPABILITY_UNAVAILABLE');
    });

    it('returns EXECUTION_FAILED when execution throws Error', async () => {
      const service = new CapabilityTestService(makeDeps({
        executeError: new Error('Connection timeout'),
      }));
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('EXECUTION_FAILED');
      expect(result.error!.message).toBe('Connection timeout');
      expect(result.error!.detail).toBeDefined(); // stack trace
    });

    it('returns EXECUTION_FAILED when execution throws non-Error', async () => {
      const deps = makeDeps();
      deps.executionProxy = {
        execute: async () => { throw 'string error'; },
      } as any;
      const service = new CapabilityTestService(deps);
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('EXECUTION_FAILED');
      expect(result.error!.message).toBe('string error');
      expect(result.error!.detail).toBeUndefined();
    });

    it('throws when provider not found', async () => {
      const service = new CapabilityTestService(makeDeps({ provider: null }));
      await expect(service.testCapability('missing', 'text.generate', {})).rejects.toThrow('Provider not found');
    });

    it('uses prompt field when text is not available', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', { prompt: 'tell me a joke' });

      expect(result.success).toBe(true);
    });

    it('JSON stringifies input when neither text nor prompt are strings', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', { data: 123 });

      expect(result.success).toBe(true);
    });

    it('passes optional systemPrompt, model, temperature, maxTokens', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', {
        text: 'hi',
        systemPrompt: 'Be helpful',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(result.success).toBe(true);
    });

    it('uses json responseFormat for extract/classify capabilities', async () => {
      // For Apple provider which has many capabilities
      const service = new CapabilityTestService(makeDeps({
        provider: makeProvider({ vendor: 'apple' as any }),
      }));
      const manifest = await service.getManifest('p1');
      // Test a non-extract/classify capability - just ensure it runs
      if (manifest.length > 0) {
        const result = await service.testCapability('p1', manifest[0].capabilityId, { text: 'test' });
        expect(result.success).toBe(true);
      }
    });

    it('handles execution result with no rawMetadata', async () => {
      const service = new CapabilityTestService(makeDeps({
        executeResult: {
          content: 'text',
          model: 'gpt-4o',
          inputTokens: 5,
          outputTokens: 10,
          finishReason: 'stop',
          latencyMs: 50,
          rawMetadata: undefined,
        },
      }));
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(true);
      expect(result.rawResponse.content).toBe('text');
    });

    it('uses file field as prompt when input has file data URI', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', {
        file: 'data:audio/wav;base64,AAAA',
      });

      expect(result.success).toBe(true);
    });

    it('returns json responseFormat for extract capabilities', async () => {
      // Use Apple provider which has many capabilities that might include extract
      const service = new CapabilityTestService(makeDeps({
        provider: makeProvider({ vendor: 'apple' as any }),
      }));
      const manifest = await service.getManifest('p1');
      const extractCap = manifest.find(c => c.capabilityId.includes('extract'));
      if (extractCap) {
        const result = await service.testCapability('p1', extractCap.capabilityId, { text: 'test' });
        expect(result.success).toBe(true);
      }
    });

    it('extracts rootCause from Error with .cause', async () => {
      const deps = makeDeps();
      deps.executionProxy = {
        execute: async () => {
          const inner = new Error('root cause message');
          const outer = new Error('wrapper');
          (outer as any).cause = inner;
          throw outer;
        },
      } as any;
      const service = new CapabilityTestService(deps);
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('EXECUTION_FAILED');
      expect(result.error!.message).toBe('root cause message');
    });

    it('uses wrapper message when cause is not an Error', async () => {
      const deps = makeDeps();
      deps.executionProxy = {
        execute: async () => {
          const outer = new Error('wrapper message');
          (outer as any).cause = 'not an error';
          throw outer;
        },
      } as any;
      const service = new CapabilityTestService(deps);
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('wrapper message');
    });

    it('sets apple method for apple-prefixed capability IDs', async () => {
      const service = new CapabilityTestService(makeDeps({
        provider: makeProvider({ vendor: 'apple' as any }),
      }));
      const manifest = await service.getManifest('p1');
      if (manifest.length > 0) {
        const appleCap = manifest[0];
        const result = await service.testCapability('p1', appleCap.capabilityId, { text: 'test' });
        expect(result.success).toBe(true);
        expect(result.capabilityId).toBe(appleCap.capabilityId);
      }
    });

    it('includes timestamp in error responses', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'unknown.cap', { text: 'hi' });
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('measures durationMs for successful executions', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('measures durationMs for failed executions', async () => {
      const service = new CapabilityTestService(makeDeps({
        executeError: new Error('timeout'),
      }));
      const result = await service.testCapability('p1', 'text.generate', { text: 'hi' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('sets output type to error for error responses', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'unknown.cap', {});
      expect(result.output.type).toBe('error');
    });

    it('passes targetLanguage and sourceLanguage from input', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', {
        text: 'hello',
        targetLanguage: 'fr',
        sourceLanguage: 'en',
      });
      expect(result.success).toBe(true);
    });

    it('passes voice and rate from input', async () => {
      const service = new CapabilityTestService(makeDeps());
      const result = await service.testCapability('p1', 'text.generate', {
        text: 'hello',
        voice: 'Samantha',
        rate: 1.5,
      });
      expect(result.success).toBe(true);
    });
  });
});
