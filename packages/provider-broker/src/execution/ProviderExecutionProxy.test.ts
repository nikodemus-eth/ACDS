import { describe, it, expect } from 'vitest';
import { ProviderExecutionProxy } from './ProviderExecutionProxy.js';
import { ProviderExecutionError } from './ProviderExecutionError.js';
import { AdapterResolver } from './AdapterResolver.js';
import type { ProviderAdapter } from '@acds/provider-adapters';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'prov-1',
    name: 'Test Provider',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    vendorName: 'openai',
    validateConfig: () => ({ valid: true, errors: [] }),
    testConnection: async () => ({ success: true, latencyMs: 10, message: 'ok' }),
    execute: async () => ({
      content: 'response',
      model: 'gpt-4',
      inputTokens: 10,
      outputTokens: 20,
      finishReason: 'stop' as const,
      latencyMs: 100,
    }),
    ...overrides,
  };
}

describe('ProviderExecutionProxy', () => {
  it('throws PROVIDER_DISABLED when provider is disabled', async () => {
    const resolver = new AdapterResolver();
    const proxy = new ProviderExecutionProxy(resolver);
    const provider = makeProvider({ enabled: false });

    try {
      await proxy.execute(provider, { prompt: 'hi', model: 'gpt-4' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
      expect((err as ProviderExecutionError).code).toBe('PROVIDER_DISABLED');
      expect((err as ProviderExecutionError).retryable).toBe(false);
    }
  });

  it('throws INVALID_CONFIG when adapter validation fails', async () => {
    const adapter = makeAdapter({
      validateConfig: () => ({ valid: false, errors: ['missing apiKey'] }),
    });
    const resolver = new AdapterResolver();
    resolver.register('openai', adapter);
    const proxy = new ProviderExecutionProxy(resolver);

    try {
      await proxy.execute(makeProvider(), { prompt: 'hi', model: 'gpt-4' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
      expect((err as ProviderExecutionError).code).toBe('INVALID_CONFIG');
      expect((err as ProviderExecutionError).message).toContain('missing apiKey');
    }
  });

  it('returns adapter response on success', async () => {
    const adapter = makeAdapter();
    const resolver = new AdapterResolver();
    resolver.register('openai', adapter);
    const proxy = new ProviderExecutionProxy(resolver);

    const result = await proxy.execute(makeProvider(), { prompt: 'hi', model: 'gpt-4' }, 'key-123');
    expect(result.content).toBe('response');
    expect(result.model).toBe('gpt-4');
  });

  it('wraps adapter execution errors as EXECUTION_FAILED', async () => {
    const adapter = makeAdapter({
      execute: async () => { throw new Error('network timeout'); },
    });
    const resolver = new AdapterResolver();
    resolver.register('openai', adapter);
    const proxy = new ProviderExecutionProxy(resolver);

    try {
      await proxy.execute(makeProvider(), { prompt: 'hi', model: 'gpt-4' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
      expect((err as ProviderExecutionError).code).toBe('EXECUTION_FAILED');
      expect((err as ProviderExecutionError).retryable).toBe(true);
      expect((err as ProviderExecutionError).cause).toBeInstanceOf(Error);
    }
  });

  it('wraps non-Error throws as EXECUTION_FAILED', async () => {
    const adapter = makeAdapter({
      execute: async () => { throw 'string error'; },
    });
    const resolver = new AdapterResolver();
    resolver.register('openai', adapter);
    const proxy = new ProviderExecutionProxy(resolver);

    try {
      await proxy.execute(makeProvider(), { prompt: 'hi', model: 'gpt-4' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
      expect((err as ProviderExecutionError).code).toBe('EXECUTION_FAILED');
      expect((err as ProviderExecutionError).cause).toBeInstanceOf(Error);
    }
  });
});
