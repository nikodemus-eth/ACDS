import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ProviderRegistryService } from './ProviderRegistryService.js';
import type { ProviderValidationService } from './ProviderValidationService.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE providers CASCADE');
});

afterAll(async () => {
  await closePool();
});

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
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const result = await service.create(validInput);

      expect(result.name).toBe('Test Provider');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('throws when validation fails', async () => {
      const repo = new PgProviderRepository(pool as any);
      const validator = new FailingValidator(['Name required', 'URL invalid']);
      const service = new ProviderRegistryService(repo, validator as unknown as ProviderValidationService);

      await expect(service.create(validInput)).rejects.toThrow('Provider validation failed');
      await expect(service.create(validInput)).rejects.toThrow('Name required');
    });
  });

  describe('getById', () => {
    it('returns the provider when it exists', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const found = await service.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null when provider does not exist', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const result = await service.getById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    it('returns all providers', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await service.create(validInput);
      await service.create({ ...validInput, name: 'Second' });

      const all = await service.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('listEnabled', () => {
    it('returns only enabled providers', async () => {
      const repo = new PgProviderRepository(pool as any);
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
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const updated = await service.update(created.id, { name: 'Renamed' });

      expect(updated.name).toBe('Renamed');
      expect(updated.id).toBe(created.id);
    });

    it('throws when provider does not exist', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await expect(service.update('00000000-0000-0000-0000-000000000000', { name: 'X' })).rejects.toThrow('Provider not found');
    });
  });

  describe('disable', () => {
    it('disables an existing provider', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      const created = await service.create(validInput);
      const disabled = await service.disable(created.id);

      expect(disabled.enabled).toBe(false);
    });

    it('throws when provider does not exist', async () => {
      const repo = new PgProviderRepository(pool as any);
      const service = new ProviderRegistryService(repo, new AlwaysValidValidator() as unknown as ProviderValidationService);

      await expect(service.disable('00000000-0000-0000-0000-000000000000')).rejects.toThrow('Provider not found');
    });
  });
});
