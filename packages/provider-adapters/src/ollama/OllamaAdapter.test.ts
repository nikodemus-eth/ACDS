import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OllamaAdapter } from './OllamaAdapter.js';
import { AdapterError } from '../base/AdapterError.js';
import { TestHttpServer, readBody, jsonResponse } from '../__test-support__/TestHttpServer.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('OllamaAdapter', () => {
  const server = new TestHttpServer();
  let baseUrl: string;
  let adapter: OllamaAdapter;

  beforeAll(async () => {
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    adapter = new OllamaAdapter();
  });

  it('should have vendorName ollama', () => {
    expect(adapter.vendorName).toBe('ollama');
  });

  describe('validateConfig', () => {
    it('should accept valid config', () => {
      const result = adapter.validateConfig({ baseUrl: 'http://localhost:11434' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty baseUrl', () => {
      const result = adapter.validateConfig({ baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid URL', () => {
      const result = adapter.validateConfig({ baseUrl: 'not-a-url' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('baseUrl is not a valid URL');
    });
  });

  describe('testConnection', () => {
    it('should succeed when server returns models', async () => {
      server.setRoutes({
        'GET /api/tags': (_req, res) => {
          jsonResponse(res, 200, { models: [{ name: 'llama3' }, { name: 'mistral' }] });
        },
      });

      const result = await adapter.testConnection({ baseUrl });
      expect(result.success).toBe(true);
      expect(result.models).toContain('llama3');
      expect(result.models).toContain('mistral');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure on non-OK status', async () => {
      server.setRoutes({
        'GET /api/tags': (_req, res) => {
          jsonResponse(res, 503, { error: 'Service Unavailable' });
        },
      });

      const result = await adapter.testConnection({ baseUrl });
      expect(result.success).toBe(false);
      expect(result.message).toContain('503');
    });

    it('should return failure when server is unreachable', async () => {
      // Use a port from a temporarily started-then-stopped server to guarantee connection refused
      const tempServer = new TestHttpServer();
      const tempUrl = await tempServer.start();
      await tempServer.close();

      const result = await adapter.testConnection({ baseUrl: tempUrl });
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    const request: AdapterRequest = { prompt: 'Hi', model: 'llama3' };

    it('should return response on success', async () => {
      server.setRoutes({
        'POST /api/generate': async (req, res) => {
          const body = JSON.parse(await readBody(req));
          expect(body.model).toBe('llama3');
          expect(body.prompt).toBe('Hi');
          jsonResponse(res, 200, {
            model: 'llama3',
            response: 'Hello!',
            done: true,
            eval_count: 5,
            prompt_eval_count: 3,
          });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('llama3');
      expect(result.finishReason).toBe('stop');
      expect(result.outputTokens).toBe(5);
      expect(result.inputTokens).toBe(3);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw retryable AdapterError on 500', async () => {
      server.setRoutes({
        'POST /api/generate': (_req, res) => {
          jsonResponse(res, 500, { error: 'Internal Server Error' });
        },
      });

      const config: AdapterConfig = { baseUrl };
      await expect(adapter.execute(config, request)).rejects.toThrow(AdapterError);
      try {
        await adapter.execute(config, request);
      } catch (err) {
        const adapterErr = err as AdapterError;
        expect(adapterErr.code).toBe('HTTP_ERROR');
        expect(adapterErr.retryable).toBe(true);
      }
    });

    it('should throw non-retryable AdapterError on 400', async () => {
      server.setRoutes({
        'POST /api/generate': (_req, res) => {
          jsonResponse(res, 400, { error: 'Bad Request' });
        },
      });

      const config: AdapterConfig = { baseUrl };
      try {
        await adapter.execute(config, request);
        expect.unreachable('should have thrown');
      } catch (err) {
        const adapterErr = err as AdapterError;
        expect(adapterErr).toBeInstanceOf(AdapterError);
        expect(adapterErr.code).toBe('HTTP_ERROR');
        expect(adapterErr.retryable).toBe(false);
      }
    });

    it('should throw EXECUTION_FAILED on network error (destroyed socket)', async () => {
      server.setHandler((req, res) => {
        // Destroy the socket to simulate a network error
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
      }
    });
  });
});
