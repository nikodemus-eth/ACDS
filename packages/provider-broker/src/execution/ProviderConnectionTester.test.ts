import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ProviderConnectionTester } from './ProviderConnectionTester.js';
import { AdapterResolver } from './AdapterResolver.js';
import { OllamaAdapter } from '@acds/provider-adapters';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'prov-1',
    name: 'Test Ollama',
    vendor: ProviderVendor.OLLAMA,
    authType: AuthType.NONE,
    baseUrl: 'http://127.0.0.1:11434',
    enabled: true,
    environment: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProviderConnectionTester', () => {
  let server: Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'llama3' }] }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    serverUrl = `http://127.0.0.1:${(addr as any).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delegates to the resolved adapter and returns connection result', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', new OllamaAdapter());
    const tester = new ProviderConnectionTester(resolver);

    const provider = makeProvider({ baseUrl: serverUrl });
    const result = await tester.testConnection(provider);

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.models).toContain('llama3');
  });

  it('returns failure when server is unreachable', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', new OllamaAdapter());
    const tester = new ProviderConnectionTester(resolver);

    // Use a port that nothing listens on
    const tempServer = createServer(() => {});
    await new Promise<void>((resolve) => tempServer.listen(0, '127.0.0.1', () => resolve()));
    const tempAddr = tempServer.address();
    const tempUrl = `http://127.0.0.1:${(tempAddr as any).port}`;
    await new Promise<void>((resolve) => tempServer.close(() => resolve()));

    const provider = makeProvider({ baseUrl: tempUrl });
    const result = await tester.testConnection(provider);

    expect(result.success).toBe(false);
  });

  it('throws when adapter is not registered for vendor', async () => {
    const resolver = new AdapterResolver();
    const tester = new ProviderConnectionTester(resolver);

    const provider = makeProvider({ vendor: ProviderVendor.GEMINI });

    await expect(tester.testConnection(provider)).rejects.toThrow('No adapter registered for vendor');
  });

  it('passes apiKey to the adapter config', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', new OllamaAdapter());
    const tester = new ProviderConnectionTester(resolver);

    const provider = makeProvider({ baseUrl: serverUrl });
    // apiKey is passed through but Ollama doesn't require it - just verify it doesn't break
    const result = await tester.testConnection(provider, 'some-api-key');
    expect(result.success).toBe(true);
  });
});
