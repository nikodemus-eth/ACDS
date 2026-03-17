import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { AdapterError } from '../base/AdapterError.js';
import { TestHttpServer, readBody, jsonResponse } from '../__test-support__/TestHttpServer.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('OpenAIAdapter', () => {
  const server = new TestHttpServer();
  let baseUrl: string;
  let adapter: OpenAIAdapter;
  const API_KEY = 'sk-test-key-12345';

  beforeAll(async () => {
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    adapter = new OpenAIAdapter();
  });

  it('should have vendorName openai', () => {
    expect(adapter.vendorName).toBe('openai');
  });

  describe('validateConfig', () => {
    it('should accept valid config with baseUrl and apiKey', () => {
      const result = adapter.validateConfig({ baseUrl: 'https://api.openai.com', apiKey: API_KEY });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing apiKey', () => {
      const result = adapter.validateConfig({ baseUrl: 'https://api.openai.com' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('apikey'))).toBe(true);
    });

    it('should reject missing baseUrl', () => {
      const result = adapter.validateConfig({ baseUrl: '', apiKey: API_KEY });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('baseurl'))).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('should succeed and return models', async () => {
      let capturedAuthHeader: string | undefined;

      server.setRoutes({
        'GET /v1/models': (req, res) => {
          capturedAuthHeader = req.headers.authorization;
          jsonResponse(res, 200, { data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }] });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.models).toContain('gpt-4');
      expect(result.models).toContain('gpt-3.5-turbo');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(capturedAuthHeader).toBe(`Bearer ${API_KEY}`);
    });

    it('should return failure on network error', async () => {
      server.setHandler((req, _res) => {
        req.socket.destroy();
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure on non-OK status', async () => {
      server.setRoutes({
        'GET /v1/models': (_req, res) => {
          jsonResponse(res, 401, { error: { message: 'Unauthorized' } });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });
  });

  describe('execute', () => {
    const request: AdapterRequest = { prompt: 'Hello', model: 'gpt-4' };

    it('should return response on success and send correct auth header', async () => {
      let capturedAuthHeader: string | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      server.setRoutes({
        'POST /v1/chat/completions': async (req, res) => {
          capturedAuthHeader = req.headers.authorization;
          capturedBody = JSON.parse(await readBody(req));
          jsonResponse(res, 200, {
            id: 'chatcmpl-123',
            model: 'gpt-4',
            choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Hi there!');
      expect(result.model).toBe('gpt-4');
      expect(result.finishReason).toBe('stop');
      expect(result.inputTokens).toBe(5);
      expect(result.outputTokens).toBe(3);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(capturedAuthHeader).toBe(`Bearer ${API_KEY}`);
      expect(capturedBody?.model).toBe('gpt-4');
    });

    it('should throw retryable AdapterError on 500', async () => {
      server.setRoutes({
        'POST /v1/chat/completions': (_req, res) => {
          jsonResponse(res, 500, { error: { message: 'Internal Server Error' } });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
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

    it('should throw EXECUTION_FAILED on network error (destroyed socket)', async () => {
      server.setHandler((req, _res) => {
        req.socket.destroy();
      });

      const config: AdapterConfig = { baseUrl, apiKey: API_KEY };
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
