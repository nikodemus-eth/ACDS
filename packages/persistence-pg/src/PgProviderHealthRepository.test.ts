// Integration Tests – PgProviderHealthRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgProviderHealthRepository } from './PgProviderHealthRepository.js';
import {
  createTestPool, runMigrations, truncateAll, closePool, type PoolLike,
} from '../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  await pool.execSQL(`
    DROP TABLE IF EXISTS provider_health CASCADE;
    CREATE TABLE provider_health (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id     VARCHAR     NOT NULL UNIQUE,
      status          VARCHAR     NOT NULL DEFAULT 'unknown',
      latency_ms      INTEGER,
      last_test_at    TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_failure_at TIMESTAMPTZ,
      message         TEXT,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
});
afterAll(async () => { await closePool(); });
beforeEach(async () => {
  await truncateAll(pool);
  await pool.query('TRUNCATE provider_health CASCADE');
});

function makeHealth(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'prov-openai',
    status: 'healthy' as const,
    lastTestAt: new Date('2026-03-16T12:00:00Z'),
    lastSuccessAt: new Date('2026-03-16T12:00:00Z'),
    lastFailureAt: null,
    latencyMs: 150,
    message: null,
    ...overrides,
  };
}

describe('PgProviderHealthRepository', () => {
  let repo: PgProviderHealthRepository;
  beforeEach(() => { repo = new PgProviderHealthRepository(pool as any); });

  describe('upsert() + findByProviderId()', () => {
    it('inserts and retrieves health', async () => {
      await repo.upsert(makeHealth());
      const result = await repo.findByProviderId('prov-openai');
      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('prov-openai');
      expect(result!.status).toBe('healthy');
      expect(result!.latencyMs).toBe(150);
    });

    it('upserts on conflict', async () => {
      await repo.upsert(makeHealth());
      await repo.upsert(makeHealth({ status: 'degraded', latencyMs: 500, message: 'Slow' }));
      const result = await repo.findByProviderId('prov-openai');
      expect(result!.status).toBe('degraded');
      expect(result!.message).toBe('Slow');
    });

    it('handles all null optional fields', async () => {
      await repo.upsert(makeHealth({
        lastTestAt: null, lastSuccessAt: null, lastFailureAt: null, latencyMs: null, message: null,
      }));
      const result = await repo.findByProviderId('prov-openai');
      expect(result!.lastTestAt).toBeNull();
      expect(result!.latencyMs).toBeNull();
    });
  });

  describe('findByProviderId()', () => {
    it('returns null for nonexistent', async () => {
      expect(await repo.findByProviderId('nope')).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('returns all health records ordered by provider_id', async () => {
      await repo.upsert(makeHealth({ providerId: 'z' }));
      await repo.upsert(makeHealth({ providerId: 'a' }));
      const results = await repo.findAll();
      expect(results).toHaveLength(2);
      expect(results[0].providerId).toBe('a');
    });

    it('returns empty array when none exist', async () => {
      expect(await repo.findAll()).toHaveLength(0);
    });
  });

  describe('findByStatus()', () => {
    it('returns only matching status', async () => {
      await repo.upsert(makeHealth({ providerId: 'p1', status: 'healthy' }));
      await repo.upsert(makeHealth({ providerId: 'p2', status: 'degraded' }));
      const results = await repo.findByStatus('healthy');
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('healthy');
    });

    it('returns empty when no match', async () => {
      expect(await repo.findByStatus('unhealthy')).toHaveLength(0);
    });
  });
});
