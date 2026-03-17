import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterResolver } from './AdapterResolver.js';
import type { ProviderAdapter } from '@acds/provider-adapters';

/** Minimal real ProviderAdapter for testing (no mocks). */
function makeFakeAdapter(vendorName: string): ProviderAdapter {
  return {
    vendorName,
    validateConfig: () => ({ valid: true, errors: [] }),
    testConnection: async () => ({ success: true, message: 'ok' }),
    execute: async () => ({ content: '', metadata: {} }),
  } as unknown as ProviderAdapter;
}

describe('AdapterResolver', () => {
  let resolver: AdapterResolver;

  beforeEach(() => {
    resolver = new AdapterResolver();
  });

  describe('register and resolve', () => {
    it('resolves a registered adapter', () => {
      const adapter = makeFakeAdapter('openai');
      resolver.register('openai', adapter);
      expect(resolver.resolve('openai')).toBe(adapter);
    });

    it('throws when resolving an unregistered vendor', () => {
      expect(() => resolver.resolve('nonexistent')).toThrow('No adapter registered for vendor: nonexistent');
    });

    it('overwrites a previously registered adapter for the same vendor', () => {
      const adapter1 = makeFakeAdapter('openai');
      const adapter2 = makeFakeAdapter('openai');
      resolver.register('openai', adapter1);
      resolver.register('openai', adapter2);
      expect(resolver.resolve('openai')).toBe(adapter2);
    });
  });

  describe('listRegistered', () => {
    it('returns empty array when no adapters registered', () => {
      expect(resolver.listRegistered()).toEqual([]);
    });

    it('returns all registered vendor names', () => {
      resolver.register('openai', makeFakeAdapter('openai'));
      resolver.register('gemini', makeFakeAdapter('gemini'));
      resolver.register('ollama', makeFakeAdapter('ollama'));
      const list = resolver.listRegistered();
      expect(list).toHaveLength(3);
      expect(list).toContain('openai');
      expect(list).toContain('gemini');
      expect(list).toContain('ollama');
    });
  });

  describe('has', () => {
    it('returns false for unregistered vendor', () => {
      expect(resolver.has('openai')).toBe(false);
    });

    it('returns true for registered vendor', () => {
      resolver.register('openai', makeFakeAdapter('openai'));
      expect(resolver.has('openai')).toBe(true);
    });

    it('returns false after checking a different vendor', () => {
      resolver.register('openai', makeFakeAdapter('openai'));
      expect(resolver.has('gemini')).toBe(false);
    });
  });
});
