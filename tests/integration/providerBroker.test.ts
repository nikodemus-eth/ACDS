// ---------------------------------------------------------------------------
// Integration Tests – Provider Broker
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type { Provider, ProviderSecret } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';
import {
  ProviderRegistryService,
  ProviderValidationService,
  AdapterResolver,
  ProviderConnectionTester,
} from '@acds/provider-broker';
import type { ProviderRepository } from '@acds/provider-broker';
import type { ProviderAdapter, AdapterConfig, AdapterConnectionResult } from '@acds/provider-adapters';

// ---------------------------------------------------------------------------
// In-memory repository mock
// ---------------------------------------------------------------------------
class InMemoryProviderRepository implements ProviderRepository {
  private providers: Provider[] = [];
  private nextId = 1;

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const provider: Provider = {
      ...input,
      id: `provider-${this.nextId++}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.providers.push(provider);
    return provider;
  }

  async findById(id: string): Promise<Provider | null> {
    return this.providers.find((p) => p.id === id) ?? null;
  }

  async findAll(): Promise<Provider[]> {
    return [...this.providers];
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.providers.filter((p) => p.vendor === vendor);
  }

  async findEnabled(): Promise<Provider[]> {
    return this.providers.filter((p) => p.enabled);
  }

  async update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider> {
    const idx = this.providers.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Provider not found: ${id}`);
    this.providers[idx] = { ...this.providers[idx], ...updates, updatedAt: new Date() };
    return this.providers[idx];
  }

  async disable(id: string): Promise<Provider> {
    return this.update(id, { enabled: false });
  }

  async delete(id: string): Promise<void> {
    this.providers = this.providers.filter((p) => p.id !== id);
  }
}

// ---------------------------------------------------------------------------
// Mock secret store
// ---------------------------------------------------------------------------
class InMemorySecretStore {
  private secrets = new Map<string, ProviderSecret>();

  store(providerId: string, secret: ProviderSecret): void {
    this.secrets.set(providerId, secret);
  }

  retrieve(providerId: string): ProviderSecret | undefined {
    return this.secrets.get(providerId);
  }

  retrieveByKeyId(keyId: string): ProviderSecret | undefined {
    for (const s of this.secrets.values()) {
      if (s.keyId === keyId) return s;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------
function createMockAdapter(success: boolean): ProviderAdapter {
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

describe('Provider Broker – Provider Registration', () => {
  let repo: InMemoryProviderRepository;
  let validator: ProviderValidationService;
  let service: ProviderRegistryService;

  beforeEach(() => {
    repo = new InMemoryProviderRepository();
    validator = new ProviderValidationService();
    service = new ProviderRegistryService(repo, validator);
  });

  it('creates a provider with valid data', async () => {
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
      authType: AuthType.LOCAL,
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

describe('Provider Broker – Secret Retrieval', () => {
  let store: InMemorySecretStore;

  beforeEach(() => {
    store = new InMemorySecretStore();
  });

  it('stores and retrieves a secret by provider ID', () => {
    const secret: ProviderSecret = {
      id: 'secret-1',
      providerId: 'provider-1',
      ciphertextBlob: 'encrypted-blob-abc',
      keyId: 'key-001',
      algorithm: 'AES-256-GCM',
      createdAt: new Date(),
      rotatedAt: null,
      expiresAt: null,
    };
    store.store('provider-1', secret);

    const retrieved = store.retrieve('provider-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.ciphertextBlob).toBe('encrypted-blob-abc');
    expect(retrieved!.algorithm).toBe('AES-256-GCM');
  });

  it('retrieves a secret by key ID', () => {
    const secret: ProviderSecret = {
      id: 'secret-2',
      providerId: 'provider-2',
      ciphertextBlob: 'encrypted-blob-xyz',
      keyId: 'key-002',
      algorithm: 'AES-256-GCM',
      createdAt: new Date(),
      rotatedAt: null,
      expiresAt: null,
    };
    store.store('provider-2', secret);

    const retrieved = store.retrieveByKeyId('key-002');
    expect(retrieved).toBeDefined();
    expect(retrieved!.providerId).toBe('provider-2');
  });

  it('returns undefined for missing secrets', () => {
    expect(store.retrieve('nonexistent')).toBeUndefined();
    expect(store.retrieveByKeyId('nonexistent-key')).toBeUndefined();
  });
});

describe('Provider Broker – Connection Testing', () => {
  it('returns success for a working adapter', async () => {
    const resolver = new AdapterResolver();
    resolver.register('ollama', createMockAdapter(true));
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
    resolver.register('ollama', createMockAdapter(false));
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
