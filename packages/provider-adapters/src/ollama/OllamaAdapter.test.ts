import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from './OllamaAdapter.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;
  const config: AdapterConfig = { baseUrl: 'http://localhost:11434' };

  beforeEach(() => {
    adapter = new OllamaAdapter();
  });

  it('should have vendorName ollama', () => {
    expect(adapter.vendorName).toBe('ollama');
  });

  it('should validate valid config', () => {
    const result = adapter.validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty baseUrl', () => {
    const result = adapter.validateConfig({ baseUrl: '' });
    expect(result.valid).toBe(false);
  });

  it('should test connection', async () => {
    const mockResponse = { models: [{ name: 'llama3' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));
    const result = await adapter.testConnection(config);
    expect(result.success).toBe(true);
    expect(result.models).toContain('llama3');
    vi.unstubAllGlobals();
  });

  it('should execute request', async () => {
    const mockResponse = { model: 'llama3', response: 'Hello!', done: true, eval_count: 5 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));
    const request: AdapterRequest = { prompt: 'Hi', model: 'llama3' };
    const result = await adapter.execute(config, request);
    expect(result.content).toBe('Hello!');
    expect(result.finishReason).toBe('stop');
    vi.unstubAllGlobals();
  });
});
