// Integration Tests – PgProviderRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgProviderRepository } from './PgProviderRepository.js';
import { AuthType, ProviderVendor, type Provider } from '@acds/core-types';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
  await pool.query('TRUNCATE providers CASCADE');
});

function makeProvider(
  overrides: Partial<Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Omit<Provider, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'OpenAI Production',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    environment: 'production',
    ...overrides,
  };
}

describe('PgProviderRepository', () => {
  let repo: PgProviderRepository;

  beforeEach(() => {
    repo = new PgProviderRepository(pool as any);
  });

  describe('create()', () => {
    it('creates a provider and returns it with id and timestamps', async () => {
      const result = await repo.create(makeProvider());
      expect(result.id).toBeTruthy();
      expect(result.name).toBe('OpenAI Production');
      expect(result.vendor).toBe(ProviderVendor.OPENAI);
      expect(result.authType).toBe(AuthType.API_KEY);
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.enabled).toBe(true);
      expect(result.environment).toBe('production');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findById()', () => {
    it('returns the provider by id', async () => {
      const created = await repo.create(makeProvider());
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for nonexistent id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('returns all providers', async () => {
      await repo.create(makeProvider({ name: 'A' }));
      await repo.create(makeProvider({ name: 'B' }));
      const results = await repo.findAll();
      expect(results).toHaveLength(2);
    });

    it('returns empty array when none exist', async () => {
      const results = await repo.findAll();
      expect(results).toHaveLength(0);
    });
  });

  describe('findByVendor()', () => {
    it('returns providers matching the vendor', async () => {
      await repo.create(makeProvider({ name: 'P1', vendor: ProviderVendor.OPENAI }));
      await repo.create(makeProvider({ name: 'P2', vendor: ProviderVendor.GEMINI }));
      const results = await repo.findByVendor(ProviderVendor.OPENAI);
      expect(results).toHaveLength(1);
    });

    it('returns empty array when no match', async () => {
      const results = await repo.findByVendor('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('findEnabled()', () => {
    it('returns only enabled providers', async () => {
      await repo.create(makeProvider({ name: 'Enabled', enabled: true }));
      await repo.create(makeProvider({ name: 'Disabled', enabled: false }));
      const results = await repo.findEnabled();
      expect(results).toHaveLength(1);
      expect(results[0].enabled).toBe(true);
    });
  });

  describe('update()', () => {
    it('updates multiple fields', async () => {
      const created = await repo.create(makeProvider());
      const updated = await repo.update(created.id, {
        name: 'New Name',
        vendor: ProviderVendor.GEMINI,
        authType: AuthType.BEARER_TOKEN,
        baseUrl: 'https://new.com',
        enabled: false,
        environment: 'staging',
      });
      expect(updated.name).toBe('New Name');
      expect(updated.vendor).toBe(ProviderVendor.GEMINI);
      expect(updated.enabled).toBe(false);
    });

    it('throws when updating a nonexistent provider', async () => {
      await expect(
        repo.update('00000000-0000-0000-0000-000000000000', { name: 'X' }),
      ).rejects.toThrow('Provider not found');
    });
  });

  describe('disable()', () => {
    it('sets enabled to false', async () => {
      const created = await repo.create(makeProvider({ enabled: true }));
      const disabled = await repo.disable(created.id);
      expect(disabled.enabled).toBe(false);
    });

    it('throws for nonexistent provider', async () => {
      await expect(
        repo.disable('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Provider not found');
    });
  });

  describe('delete()', () => {
    it('deletes the provider', async () => {
      const created = await repo.create(makeProvider());
      await repo.delete(created.id);
      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });

    it('does not throw when deleting nonexistent provider', async () => {
      await expect(repo.delete('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
    });
  });
});
