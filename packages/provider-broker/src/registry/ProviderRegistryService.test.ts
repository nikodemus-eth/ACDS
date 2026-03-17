import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ProviderRegistryService } from './ProviderRegistryService.js';
import type { ProviderRepository } from './ProviderRepository.js';
import type { ProviderValidationService } from './ProviderValidationService.js';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

class InMemoryProviderRepository implements ProviderRepository {
  private providers: Provider[] = [];

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const provider: Provider = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.providers.push(provider);
    return provider;
  }

  async findById(id: string): Promise<Provider | null> {
    return this.providers.find(p => p.id === id) ?? null;
  }

  async findAll(): Promise<Provider[]> {
    return [...this.providers];
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.providers.filter(p => p.vendor === vendor);
  }

  async findEnabled(): Promise<Provider[]> {
    return this.providers.filter(p => p.enabled);
  }

  async update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider> {
    const idx = this.providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Not found: ${id}`);
    const updated = { ...this.providers[idx]!, ...updates, updatedAt: new Date() };
    this.providers[idx] = updated;
    return updated;
  }

  async disable(id: string): Promise<Provider> {
    return this.update(id, { enabled: false });
  }

  async delete(id: string): Promise<void> {
    this.providers = this.providers.filter(p => p.id !== id);
  }
}

class AlwaysValidValidator {
  validate(): string[] {
    return [];
  }
}

class FailingValidator {
  private errors: string[];
  constructor(errors: string[]) {
    this.errors = errors;
  }
  validate(): string[] {
    return this.errors;
  }
}

const validInput = {
  name: 'Test Provider',
  vendor: ProviderVendor.OPENAI,
  authType: AuthType.API_KEY,
  baseUrl: 'https://api.openai.com',
  enabled: true,
  environment: 'test',
};

describe('ProviderRegistryService', () => {
  describe('create', () => {
    it('creates a provider when validation passes', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const result = await service.create(validInput);

      expect(result.name).toBe('Test Provider');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('throws when validation fails', async () => {
      const repo = new InMemoryProviderRepository();
      const validator = new FailingValidator(['Name required', 'URL invalid']);
      const service = new ProviderRegistryService(repo, validator as unknown as ProviderValidationService);

      await expect(service.create(validInput)).rejects.toThrow('Provider validation failed');
      await expect(service.create(validInput)).rejects.toThrow('Name required');
    });
  });

  describe('getById', () => {
    it('returns the provider when it exists', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const found = await service.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null when provider does not exist', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const result = await service.getById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    it('returns all providers', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await service.create(validInput);
      await service.create({ ...validInput, name: 'Second' });

      const all = await service.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('listEnabled', () => {
    it('returns only enabled providers', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const p1 = await service.create(validInput);
      await service.create({ ...validInput, name: 'Disabled', enabled: false });

      const enabled = await service.listEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]!.id).toBe(p1.id);
    });
  });

  describe('update', () => {
    it('updates an existing provider', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const updated = await service.update(created.id, { name: 'Renamed' });

      expect(updated.name).toBe('Renamed');
      expect(updated.id).toBe(created.id);
    });

    it('throws when provider does not exist', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow('Provider not found');
    });
  });

  describe('disable', () => {
    it('disables an existing provider', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const disabled = await service.disable(created.id);

      expect(disabled.enabled).toBe(false);
    });

    it('throws when provider does not exist', async () => {
      const repo = new InMemoryProviderRepository();
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await expect(service.disable('nonexistent')).rejects.toThrow('Provider not found');
    });
  });
});
