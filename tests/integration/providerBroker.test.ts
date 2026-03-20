// ---------------------------------------------------------------------------
// Integration Tests -- Provider Broker
// PGlite-backed: no InMemory/Mock/Stub classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';
import {
  ProviderRegistryService,
  ProviderValidationService,
  AdapterResolver,
  ProviderConnectionTester,
} from '@acds/provider-broker';
import type { ProviderAdapter, AdapterConfig, AdapterConnectionResult } from '@acds/provider-adapters';
import {
  PgProviderRepository,
  PgSecretCipherStore,
} from '@acds/persistence-pg';
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// ---------------------------------------------------------------------------
// Static adapter for connection testing (not a mock -- returns fixed values)
// ---------------------------------------------------------------------------
function createStaticAdapter(success: boolean): ProviderAdapter {
  return {
    vendorName: 'ollama',
    validateConfig: (_config: AdapterConfig) => ({ valid: true, errors: [] }),
    testConnection: async (_config: AdapterConfig): Promise<AdapterConnectionResult> => {
      if (success) {
        return { success: true, latencyMs: 42, message: 'Connected', models: ['llama3'] };
      }
      return { success: false, latencyMs: 0, message: 'Connection refused' };
    },
    execute: async () => {
      throw new Error('Not implemented in this test');
    },
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Provider Broker -- Provider Registration', () => {
  it('creates a provider with valid data', async () => {
    const repo = new PgProviderRepository(pool as any);
    const validator = new ProviderValidationService();
    const service = new ProviderRegistryService(repo, validator);

    const provider = await service.create({
      name: 'Local Ollama',
      vendor: ProviderVendor.OLLAMA,
      authType: AuthType.NONE,
      baseUrl: 'http://localhost:11434',
      enabled: true,
      environment: 'development',
    });

    expect(provider).toBeDefined();
    expect(provider.id).toBeTruthy();
    expect(provider.name).toBe('Local Ollama');
    expect(provider.vendor).toBe(ProviderVendor.OLLAMA);
    expect(provider.createdAt).toBeInstanceOf(Date);
  });

  it('validates vendor and rejects invalid values', async () => {
    const repo = new PgProviderRepository(pool as any);
    const validator = new ProviderValidationService();
    const service = new ProviderRegistryService(repo, validator);

    await expect(
      service.create({
        name: 'Bad Provider',
        vendor: 'invalid_vendor' as ProviderVendor,
        authType: AuthType.API_KEY,
        baseUrl: 'http://localhost:8080',
        enabled: true,
        environment: 'development',
      }),
    ).rejects.toThrow('Provider validation failed');
  });

  it('validates auth type and rejects invalid values', async () => {
    const repo = new PgProviderRepository(pool as any);
    const validator = new ProviderValidationService();
    const service = new ProviderRegistryService(repo, validator);

    await expect(
      service.create({
        name: 'Bad Auth Provider',
        vendor: ProviderVendor.OPENAI,
        authType: 'invalid_auth' as AuthType,
        baseUrl: 'https://api.openai.com',
        enabled: true,
        environment: 'production',
      }),
    ).rejects.toThrow('Provider validation failed');
  });

  it('validates base URL format', async () => {
    const repo = new PgProviderRepository(pool as any);
    const validator = new ProviderValidationService();
    const service = new ProviderRegistryService(repo, validator);

    await expect(
      service.create({
        name: 'Bad URL Provider',
        vendor: ProviderVendor.GEMINI,
        authType: AuthType.API_KEY,
        baseUrl: 'not-a-url',
        enabled: true,
        environment: 'production',
      }),
    ).rejects.toThrow('Provider validation failed');
  });

  it('lists enabled providers only', async () => {
    const repo = new PgProviderRepository(pool as any);
    const validator = new ProviderValidationService();
    const service = new ProviderRegistryService(repo, validator);

    await service.create({
      name: 'Enabled',
      vendor: ProviderVendor.OLLAMA,
      authType: AuthType.NONE,
      baseUrl: 'http://localhost:11434',
      enabled: true,
      environment: 'development',
    });
    const disabled = await service.create({
      name: 'Will Disable',
      vendor: ProviderVendor.LMSTUDIO,
      authType: AuthType.CUSTOM,
      baseUrl: 'http://localhost:1234',
      enabled: true,
      environment: 'development',
    });
    await service.disable(disabled.id);

    const enabled = await service.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('Enabled');
  });
});

describe('Provider Broker -- Secret Store', () => {
  it('stores and retrieves a secret by provider ID', async () => {
    const store = new PgSecretCipherStore(pool as any);

    const envelope = {
      ciphertext: 'encrypted-blob-abc',
      iv: 'test-iv',
      tag: 'test-tag',
      algorithm: 'AES-256-GCM',
    };

    await store.store('provider-1', envelope);
    const retrieved = await store.retrieve('provider-1');

    expect(retrieved).toBeDefined();
    expect(retrieved!.envelope.ciphertext).toBe('encrypted-blob-abc');
    expect(retrieved!.envelope.algorithm).toBe('AES-256-GCM');
  });

  it('returns null for missing secrets', async () => {
    const store = new PgSecretCipherStore(pool as any);
    const result = await store.retrieve('nonexistent');
    expect(result).toBeNull();
  });

  it('checks existence of secrets', async () => {
    const store = new PgSecretCipherStore(pool as any);

    expect(await store.exists('nonexistent')).toBe(false);

    await store.store('provider-exists', {
      ciphertext: 'test',
      iv: 'iv',
      tag: 'tag',
      algorithm: 'AES-256-GCM',
    });

    expect(await store.exists('provider-exists')).toBe(true);
  });
});

describe('Provider Broker -- Connection Testing', () => {
  it('returns success for a working adapter', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', createStaticAdapter(true));
    const tester = new ProviderConnectionTester(resolver);

    const provider: Provider = {
      id: 'prov-1',
      name: 'Test Ollama',
      vendor: ProviderVendor.OLLAMA,
      authType: AuthType.NONE,
      baseUrl: 'http://localhost:11434',
      enabled: true,
      environment: 'development',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tester.testConnection(provider);
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.message).toBe('Connected');
    expect(result.models).toContain('llama3');
  });

  it('returns failure for a broken adapter', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', createStaticAdapter(false));
    const tester = new ProviderConnectionTester(resolver);

    const provider: Provider = {
      id: 'prov-2',
      name: 'Down Ollama',
      vendor: ProviderVendor.OLLAMA,
      authType: AuthType.NONE,
      baseUrl: 'http://localhost:11434',
      enabled: true,
      environment: 'development',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tester.testConnection(provider);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Connection refused');
  });

  it('throws when no adapter is registered for the vendor', async () => {
    const resolver = new AdapterResolver();
    const tester = new ProviderConnectionTester(resolver);

    const provider: Provider = {
      id: 'prov-3',
      name: 'Unknown Vendor',
      vendor: ProviderVendor.GEMINI,
      authType: AuthType.API_KEY,
      baseUrl: 'https://api.example.com',
      enabled: true,
      environment: 'production',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(tester.testConnection(provider)).rejects.toThrow(
      'No adapter registered for vendor',
    );
  });
});
