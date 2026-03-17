import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppleIntelligenceAdapter } from './AppleIntelligenceAdapter.js';
import { AdapterError } from '../base/AdapterError.js';
import { TestHttpServer, readBody, jsonResponse } from '../__test-support__/TestHttpServer.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('AppleIntelligenceAdapter', () => {
  const server = new TestHttpServer();
  let baseUrl: string;
  let adapter: AppleIntelligenceAdapter;

  beforeAll(async () => {
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    adapter = new AppleIntelligenceAdapter();
  });

  it('should have vendorName apple', () => {
    expect(adapter.vendorName).toBe('apple');
  });

  describe('validateConfig', () => {
    it('should validate valid localhost config', () => {
      const result = adapter.validateConfig({ baseUrl: 'http://localhost:11435' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate 127.0.0.1 config', () => {
      const result = adapter.validateConfig({ baseUrl: 'http://127.0.0.1:11435' });
      expect(result.valid).toBe(true);
    });

    it('should validate IPv6 loopback config', () => {
      const result = adapter.validateConfig({ baseUrl: 'http://[::1]:11435' });
      expect(result.valid).toBe(true);
    });

    it('should reject empty baseUrl', () => {
      const result = adapter.validateConfig({ baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('baseUrl is required');
    });

    it('should reject non-loopback URLs', () => {
      const result = adapter.validateConfig({ baseUrl: 'https://remote.example.com' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/loopback/i);
    });

    it('should reject invalid URL format', () => {
      const result = adapter.validateConfig({ baseUrl: 'not-a-url' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('baseUrl is not a valid URL');
    });
  });

  describe('testConnection', () => {
    it('should succeed when bridge /health responds OK with models', async () => {
      server.setRoutes({
        'GET /health': (_req, res) => {
          jsonResponse(res, 200, { status: 'healthy', models: ['apple-fm-base'] });
        },
      });

      // The server binds on 127.0.0.1 which is a valid loopback address
      const config: AdapterConfig = { baseUrl };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.models).toContain('apple-fm-base');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail when bridge returns non-OK (503)', async () => {
      server.setRoutes({
        'GET /health': (_req, res) => {
          jsonResponse(res, 503, { status: 'unavailable' });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('503');
    });

    it('should fail when bridge is unreachable', async () => {
      const tempServer = new TestHttpServer();
      const tempUrl = await tempServer.start();
      await tempServer.close();

      const result = await adapter.testConnection({ baseUrl: tempUrl });
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    const request: AdapterRequest = { prompt: 'Hi', model: 'apple-fm-base' };

    it('should send request and map response', async () => {
      server.setRoutes({
        'POST /execute': async (req, res) => {
          const body = JSON.parse(await readBody(req));
          jsonResponse(res, 200, {
            model: 'apple-fm-base',
            content: 'Hello from Apple',
            done: true,
            outputTokens: 5,
          });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Hello from Apple');
      expect(result.finishReason).toBe('stop');
      expect(result.outputTokens).toBe(5);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw on non-OK response (500)', async () => {
      server.setRoutes({
        'POST /execute': (_req, res) => {
          jsonResponse(res, 500, { error: 'Internal Server Error' });
        },
      });

      const config: AdapterConfig = { baseUrl };
      await expect(adapter.execute(config, request)).rejects.toThrow('Apple Intelligence bridge returned HTTP 500');
    });

    it('should throw EXECUTION_FAILED on network error (destroyed socket)', async () => {
      server.setHandler((req, _res) => {
        req.socket.destroy();
      });

      const config: AdapterConfig = { baseUrl };
      try {
        await adapter.execute(config, request);
        expect.unreachable('should have thrown');
      } catch (err) {
        const adapterErr = err as AdapterError;
        expect(adapterErr).toBeInstanceOf(AdapterError);
        expect(adapterErr.code).toBe('EXECUTION_FAILED');
        expect(adapterErr.message).toContain('Apple Intelligence execution failed');
      }
    });
  });
});
