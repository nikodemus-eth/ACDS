// ---------------------------------------------------------------------------
// Integration Tests – PgProviderRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgProviderRepository } from '@acds/persistence-pg';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

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

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: 'OpenAI Production',
    vendor: 'openai' as const,
    authType: 'api_key' as const,
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

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a provider and returns it with id and timestamps', async () => {
      const result = await repo.create(makeProvider());

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('OpenAI Production');
      expect(result.vendor).toBe('openai');
      expect(result.authType).toBe('api_key');
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.enabled).toBe(true);
      expect(result.environment).toBe('production');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns the provider by id', async () => {
      const created = await repo.create(makeProvider());
      const found = await repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('OpenAI Production');
    });

    it('returns null for nonexistent id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ── findAll() ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all providers', async () => {
      await repo.create(makeProvider({ name: 'Provider A' }));
      await repo.create(makeProvider({ name: 'Provider B' }));

      const results = await repo.findAll();
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no providers exist', async () => {
      const results = await repo.findAll();
      expect(results).toHaveLength(0);
    });
  });

  // ── findByVendor() ────────────────────────────────────────────────────────

  describe('findByVendor()', () => {
    it('returns providers matching the vendor', async () => {
      await repo.create(makeProvider({ name: 'P1', vendor: 'openai' }));
      await repo.create(makeProvider({ name: 'P2', vendor: 'anthropic' }));
      await repo.create(makeProvider({ name: 'P3', vendor: 'openai' }));

      const results = await repo.findByVendor('openai');
      expect(results).toHaveLength(2);
      results.forEach(r => expect(r.vendor).toBe('openai'));
    });

    it('returns empty array when no vendor match', async () => {
      const results = await repo.findByVendor('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  // ── findEnabled() ─────────────────────────────────────────────────────────

  describe('findEnabled()', () => {
    it('returns only enabled providers', async () => {
      await repo.create(makeProvider({ name: 'Enabled', enabled: true }));
      await repo.create(makeProvider({ name: 'Disabled', enabled: false }));

      const results = await repo.findEnabled();
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Enabled');
      expect(results[0].enabled).toBe(true);
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates the name', async () => {
      const created = await repo.create(makeProvider());
      const updated = await repo.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(created.id);
    });

    it('updates multiple fields', async () => {
      const created = await repo.create(makeProvider());
      const updated = await repo.update(created.id, {
        name: 'New Name',
        vendor: 'anthropic' as any,
        authType: 'bearer_token' as any,
        baseUrl: 'https://api.anthropic.com/v1',
        enabled: false,
        environment: 'staging',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.vendor).toBe('anthropic');
      expect(updated.authType).toBe('bearer_token');
      expect(updated.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(updated.enabled).toBe(false);
      expect(updated.environment).toBe('staging');
    });

    it('throws when updating a nonexistent provider', async () => {
      await expect(
        repo.update('00000000-0000-0000-0000-000000000000', { name: 'X' }),
      ).rejects.toThrow('Provider not found');
    });
  });

  // ── disable() ─────────────────────────────────────────────────────────────

  describe('disable()', () => {
    it('sets enabled to false', async () => {
      const created = await repo.create(makeProvider({ enabled: true }));
      const disabled = await repo.disable(created.id);

      expect(disabled.enabled).toBe(false);
      expect(disabled.id).toBe(created.id);

      // Verify persistence
      const found = await repo.findById(created.id);
      expect(found!.enabled).toBe(false);
    });

    it('throws when disabling a nonexistent provider', async () => {
      await expect(
        repo.disable('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Provider not found');
    });
  });

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes the provider', async () => {
      const created = await repo.create(makeProvider());
      await repo.delete(created.id);

      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });

    it('does not throw when deleting nonexistent provider', async () => {
      await expect(
        repo.delete('00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });
  });
});
