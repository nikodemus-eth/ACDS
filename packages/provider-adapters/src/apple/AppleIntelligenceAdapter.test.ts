import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppleIntelligenceAdapter } from './AppleIntelligenceAdapter.js';
import type { AdapterConfig, AdapterRequest } from '../base/AdapterTypes.js';

describe('AppleIntelligenceAdapter', () => {
  let adapter: AppleIntelligenceAdapter;
  const config: AdapterConfig = { baseUrl: 'http://localhost:11435' };

  beforeEach(() => {
    adapter = new AppleIntelligenceAdapter();
  });

  it('should have vendorName apple', () => {
    expect(adapter.vendorName).toBe('apple');
  });

  describe('validateConfig', () => {
    it('should validate valid localhost config', () => {
      const result = adapter.validateConfig(config);
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
    it('should succeed when bridge /health responds OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy', models: ['apple-fm-base'] }),
      }));
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(true);
      expect(result.models).toContain('apple-fm-base');
      vi.unstubAllGlobals();
    });

    it('should fail when bridge returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }));
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('503');
      vi.unstubAllGlobals();
    });

    it('should fail when bridge is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const result = await adapter.testConnection(config);
      expect(result.success).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
      vi.unstubAllGlobals();
    });
  });

  describe('execute', () => {
    it('should send request and map response', async () => {
      const mockResponse = { model: 'apple-fm-base', content: 'Hello from Apple', done: true, outputTokens: 5 };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }));
      const request: AdapterRequest = { prompt: 'Hi', model: 'apple-fm-base' };
      const result = await adapter.execute(config, request);
      expect(result.content).toBe('Hello from Apple');
      expect(result.finishReason).toBe('stop');
      expect(result.outputTokens).toBe(5);
      vi.unstubAllGlobals();
    });

    it('should throw on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }));
      const request: AdapterRequest = { prompt: 'Hi', model: 'apple-fm-base' };
      await expect(adapter.execute(config, request)).rejects.toThrow('Apple Intelligence bridge returned HTTP 500');
      vi.unstubAllGlobals();
    });

    it('should throw on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
      const request: AdapterRequest = { prompt: 'Hi', model: 'apple-fm-base' };
      await expect(adapter.execute(config, request)).rejects.toThrow('Apple Intelligence execution failed');
      vi.unstubAllGlobals();
    });
  });
});
