import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './GeminiAdapter.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;
  const config: AdapterConfig = { baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key' };

  beforeEach(() => { adapter = new GeminiAdapter(); });

  it('should have vendorName gemini', () => { expect(adapter.vendorName).toBe('gemini'); });

  it('should require apiKey', () => {
    const result = adapter.validateConfig({ baseUrl: 'https://example.com' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('apiKey is required for Gemini');
  });

  it('should test connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ models: [{ name: 'gemini-pro' }] }),
    }));
    const result = await adapter.testConnection(config);
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it('should execute request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Response' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    }));
    const request: AdapterRequest = { prompt: 'Hello', model: 'gemini-pro' };
    const result = await adapter.execute(config, request);
    expect(result.content).toBe('Response');
    expect(result.finishReason).toBe('stop');
    vi.unstubAllGlobals();
  });
});
