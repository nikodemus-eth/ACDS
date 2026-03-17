// ---------------------------------------------------------------------------
// Integration Tests – PgProviderHealthRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgProviderHealthRepository } from '@acds/persistence-pg';
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

  // Migration 002 has an FK on providers(id). Drop and recreate without FK
  // so we can test the health repo independently.
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

afterAll(async () => {
  await closePool();
});

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

  beforeEach(() => {
    repo = new PgProviderHealthRepository(pool as any);
  });

  // ── upsert() + findByProviderId() ─────────────────────────────────────────

  describe('upsert() + findByProviderId()', () => {
    it('inserts and retrieves health by provider id', async () => {
      await repo.upsert(makeHealth());

      const result = await repo.findByProviderId('prov-openai');
      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('prov-openai');
      expect(result!.status).toBe('healthy');
      expect(result!.latencyMs).toBe(150);
      expect(result!.lastTestAt).toBeInstanceOf(Date);
      expect(result!.lastSuccessAt).toBeInstanceOf(Date);
      expect(result!.lastFailureAt).toBeNull();
      expect(result!.message).toBeNull();
    });

    it('upserts (updates existing on conflict)', async () => {
      await repo.upsert(makeHealth());
      await repo.upsert(makeHealth({
        status: 'degraded',
        latencyMs: 500,
        message: 'High latency detected',
      }));

      const result = await repo.findByProviderId('prov-openai');
      expect(result!.status).toBe('degraded');
      expect(result!.latencyMs).toBe(500);
      expect(result!.message).toBe('High latency detected');

      // Only one row
      const count = await pool.query(
        "SELECT count(*)::int AS cnt FROM provider_health WHERE provider_id = $1",
        ['prov-openai'],
      );
      expect(count.rows[0].cnt).toBe(1);
    });

    it('handles all null optional fields', async () => {
      await repo.upsert(makeHealth({
        lastTestAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        latencyMs: null,
        message: null,
      }));

      const result = await repo.findByProviderId('prov-openai');
      expect(result!.lastTestAt).toBeNull();
      expect(result!.lastSuccessAt).toBeNull();
      expect(result!.lastFailureAt).toBeNull();
      expect(result!.latencyMs).toBeNull();
      expect(result!.message).toBeNull();
    });

    it('handles lastFailureAt being set', async () => {
      await repo.upsert(makeHealth({
        status: 'unhealthy',
        lastFailureAt: new Date('2026-03-16T11:00:00Z'),
        message: 'Connection refused',
      }));

      const result = await repo.findByProviderId('prov-openai');
      expect(result!.status).toBe('unhealthy');
      expect(result!.lastFailureAt).toBeInstanceOf(Date);
      expect(result!.message).toBe('Connection refused');
    });
  });

  // ── findByProviderId() ────────────────────────────────────────────────────

  describe('findByProviderId()', () => {
    it('returns null for nonexistent provider', async () => {
      const result = await repo.findByProviderId('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── findAll() ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all health records', async () => {
      await repo.upsert(makeHealth({ providerId: 'prov-a' }));
      await repo.upsert(makeHealth({ providerId: 'prov-b' }));

      const results = await repo.findAll();
      expect(results).toHaveLength(2);
    });

    it('returns records ordered by provider_id', async () => {
      await repo.upsert(makeHealth({ providerId: 'prov-z' }));
      await repo.upsert(makeHealth({ providerId: 'prov-a' }));

      const results = await repo.findAll();
      expect(results[0].providerId).toBe('prov-a');
      expect(results[1].providerId).toBe('prov-z');
    });

    it('returns empty array when none exist', async () => {
      const results = await repo.findAll();
      expect(results).toHaveLength(0);
    });
  });

  // ── findByStatus() ────────────────────────────────────────────────────────

  describe('findByStatus()', () => {
    it('returns only providers with the specified status', async () => {
      await repo.upsert(makeHealth({ providerId: 'prov-1', status: 'healthy' }));
      await repo.upsert(makeHealth({ providerId: 'prov-2', status: 'degraded' }));
      await repo.upsert(makeHealth({ providerId: 'prov-3', status: 'healthy' }));

      const results = await repo.findByStatus('healthy');
      expect(results).toHaveLength(2);
      results.forEach(r => expect(r.status).toBe('healthy'));
    });

    it('returns empty array when no match', async () => {
      await repo.upsert(makeHealth({ status: 'healthy' }));

      const results = await repo.findByStatus('unhealthy');
      expect(results).toHaveLength(0);
    });
  });
});
