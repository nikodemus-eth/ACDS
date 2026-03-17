import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GeminiAdapter } from './GeminiAdapter.js';
import { AdapterError } from '../base/AdapterError.js';
import { toGeminiRequest, fromGeminiResponse } from './GeminiMapper.js';
import { TestHttpServer, readBody, jsonResponse } from '../__test-support__/TestHttpServer.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('GeminiAdapter', () => {
  const server = new TestHttpServer();
  let baseUrl: string;
  let adapter: GeminiAdapter;

  beforeAll(async () => {
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    adapter = new GeminiAdapter();
  });

  it('should have vendorName gemini', () => {
    expect(adapter.vendorName).toBe('gemini');
  });

  describe('validateConfig', () => {
    it('should accept valid config', () => {
      const result = adapter.validateConfig({ baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing apiKey', () => {
      const result = adapter.validateConfig({ baseUrl: 'https://example.com' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('apiKey is required for Gemini');
    });

    it('should reject missing baseUrl', () => {
      const result = adapter.validateConfig({ baseUrl: '', apiKey: 'test-key' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('baseUrl is required');
    });
  });

  describe('testConnection', () => {
    it('should succeed when server returns models', async () => {
      server.setRoutes({
        'GET /v1beta/models': (_req, res) => {
          jsonResponse(res, 200, { models: [{ name: 'gemini-pro' }] });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: 'test-key' };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.models).toContain('gemini-pro');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure on non-OK status', async () => {
      server.setRoutes({
        'GET /v1beta/models': (_req, res) => {
          jsonResponse(res, 403, { error: 'Forbidden' });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: 'test-key' };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('403');
    });

    it('should redact API key in error messages', async () => {
      // Use a port from a stopped server to force a network error whose message contains the URL with key=
      const tempServer = new TestHttpServer();
      const tempUrl = await tempServer.start();
      const tempPort = tempServer.port;
      await tempServer.close();

      const config: AdapterConfig = { baseUrl: tempUrl, apiKey: 'secret-key' };
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      // The error message should NOT contain the actual key
      expect(result.message).not.toContain('secret-key');
    });
  });

  describe('execute', () => {
    const request: AdapterRequest = { prompt: 'Hello', model: 'gemini-pro' };

    it('should return response on success', async () => {
      server.setRoutes({
        'POST /v1beta/models/gemini-pro:generateContent': async (req, res) => {
          const body = JSON.parse(await readBody(req));
          jsonResponse(res, 200, {
            candidates: [{ content: { parts: [{ text: 'Response' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
          });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: 'test-key' };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Response');
      expect(result.finishReason).toBe('stop');
      expect(result.inputTokens).toBe(5);
      expect(result.outputTokens).toBe(1);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw AdapterError on 500', async () => {
      server.setRoutes({
        'POST /v1beta/models/gemini-pro:generateContent': (_req, res) => {
          jsonResponse(res, 500, { error: 'Internal Server Error' });
        },
      });

      const config: AdapterConfig = { baseUrl, apiKey: 'test-key' };
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

    it('should throw EXECUTION_FAILED on network error', async () => {
      server.setHandler((req, _res) => {
        req.socket.destroy();
      });

      const config: AdapterConfig = { baseUrl, apiKey: 'test-key' };
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

describe('GeminiMapper', () => {
  it('includes systemInstruction when systemPrompt is provided', () => {
    const request: AdapterRequest = {
      prompt: 'Hello',
      model: 'gemini-pro',
      systemPrompt: 'You are helpful',
    };
    const result = toGeminiRequest(request);
    expect(result.systemInstruction).toBeDefined();
    expect(result.systemInstruction!.parts[0].text).toBe('You are helpful');
  });

  it('omits systemInstruction when no systemPrompt', () => {
    const request: AdapterRequest = { prompt: 'Hello', model: 'gemini-pro' };
    const result = toGeminiRequest(request);
    expect(result.systemInstruction).toBeUndefined();
  });

  it('maps MAX_TOKENS finishReason to length', () => {
    const result = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }],
    }, 10);
    expect(result.finishReason).toBe('length');
  });

  it('maps unknown finishReason to unknown', () => {
    const result = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'OTHER' }],
    }, 10);
    expect(result.finishReason).toBe('unknown');
  });
});
