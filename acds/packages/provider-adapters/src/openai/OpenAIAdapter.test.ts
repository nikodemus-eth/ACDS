import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;
  const config: AdapterConfig = { baseUrl: 'https://api.openai.com', apiKey: 'sk-test' };

  beforeEach(() => { adapter = new OpenAIAdapter(); });

  it('should have vendorName openai', () => { expect(adapter.vendorName).toBe('openai'); });

  it('should require apiKey', () => {
    const result = adapter.validateConfig({ baseUrl: 'https://api.openai.com' });
    expect(result.valid).toBe(false);
  });

  it('should test connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ data: [{ id: 'gpt-4' }] }),
    }));
    const result = await adapter.testConnection(config);
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it('should execute request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({
        id: '1', model: 'gpt-4', choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    }));
    const request: AdapterRequest = { prompt: 'Hello', model: 'gpt-4' };
    const result = await adapter.execute(config, request);
    expect(result.content).toBe('Hi');
    vi.unstubAllGlobals();
  });
});
