import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LMStudioAdapter } from './LMStudioAdapter.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('LMStudioAdapter', () => {
  let adapter: LMStudioAdapter;
  const config: AdapterConfig = { baseUrl: 'http://localhost:1234' };

  beforeEach(() => { adapter = new LMStudioAdapter(); });

  it('should have vendorName lmstudio', () => { expect(adapter.vendorName).toBe('lmstudio'); });

  it('should validate valid config', () => {
    expect(adapter.validateConfig(config).valid).toBe(true);
  });

  it('should test connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ data: [{ id: 'model-1' }] }),
    }));
    const result = await adapter.testConnection(config);
    expect(result.success).toBe(true);
    vi.unstubAllGlobals();
  });

  it('should execute request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({
        id: '1', model: 'model-1', choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    }));
    const request: AdapterRequest = { prompt: 'Hello', model: 'model-1' };
    const result = await adapter.execute(config, request);
    expect(result.content).toBe('Hi');
    vi.unstubAllGlobals();
  });
});
