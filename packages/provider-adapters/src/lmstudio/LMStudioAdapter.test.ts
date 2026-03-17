import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LMStudioAdapter } from './LMStudioAdapter.js';
import { AdapterError } from '../base/AdapterError.js';
import { TestHttpServer, readBody, jsonResponse } from '../__test-support__/TestHttpServer.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('LMStudioAdapter', () => {
  const server = new TestHttpServer();
  let baseUrl: string;
  let adapter: LMStudioAdapter;

  beforeAll(async () => {
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    adapter = new LMStudioAdapter();
  });

  it('should have vendorName lmstudio', () => {
    expect(adapter.vendorName).toBe('lmstudio');
  });

  describe('validateConfig', () => {
    it('should accept valid config', () => {
      const result = adapter.validateConfig({ baseUrl: 'http://localhost:1234' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty baseUrl', () => {
      const result = adapter.validateConfig({ baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('baseUrl is required');
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
        'GET /v1/models': (_req, res) => {
          jsonResponse(res, 200, { data: [{ id: 'model-1' }, { id: 'model-2' }] });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.models).toContain('model-1');
      expect(result.models).toContain('model-2');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure on non-OK status', async () => {
      server.setRoutes({
        'GET /v1/models': (_req, res) => {
          jsonResponse(res, 503, { error: 'Service Unavailable' });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('503');
    });

    it('should return failure when server is unreachable', async () => {
      const tempServer = new TestHttpServer();
      const tempUrl = await tempServer.start();
      await tempServer.close();

      const result = await adapter.testConnection({ baseUrl: tempUrl });
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    const request: AdapterRequest = { prompt: 'Hello', model: 'model-1' };

    it('should return response on success', async () => {
      server.setRoutes({
        'POST /v1/chat/completions': async (req, res) => {
          const body = JSON.parse(await readBody(req));
          expect(body.model).toBe('model-1');
          jsonResponse(res, 200, {
            id: '1',
            model: 'model-1',
            choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 3, completion_tokens: 1 },
          });
        },
      });

      const config: AdapterConfig = { baseUrl };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Hi');
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw retryable AdapterError on 500', async () => {
      server.setRoutes({
        'POST /v1/chat/completions': (_req, res) => {
          jsonResponse(res, 500, { error: 'Internal Server Error' });
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
        expect(adapterErr.retryable).toBe(true);
      }
    });

    it('should throw non-retryable AdapterError on 400', async () => {
      server.setRoutes({
        'POST /v1/chat/completions': (_req, res) => {
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
      }
    });
  });
});
