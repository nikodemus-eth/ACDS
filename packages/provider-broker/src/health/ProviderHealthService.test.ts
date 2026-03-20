import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ProviderHealthService } from './ProviderHealthService.js';
import { PgProviderHealthRepository } from '@acds/persistence-pg';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

/* ------------------------------------------------------------------ */
/*  Deterministic UUID constants for test providers                    */
/* ------------------------------------------------------------------ */
const PROV_1 = '00000000-0000-0000-0000-000000000001';
const PROV_2 = '00000000-0000-0000-0000-000000000002';
const PROV_3 = '00000000-0000-0000-0000-000000000003';
const PROV_A = '00000000-0000-0000-0000-00000000000a';
const PROV_B = '00000000-0000-0000-0000-00000000000b';
const PROV_C = '00000000-0000-0000-0000-00000000000c';
const PROV_X = '00000000-0000-0000-0000-0000000000ff';
const UNKNOWN = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let pool: PoolLike;
let repo: PgProviderHealthRepository;
let service: ProviderHealthService;

/** Insert a minimal provider row so foreign-key constraints are satisfied. */
async function seedProvider(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, `test-${id.slice(-4)}`, 'test-vendor', 'api_key', 'https://test.example.com'],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE providers CASCADE');
  repo = new PgProviderHealthRepository(pool as any);
  service = new ProviderHealthService(repo);
});

afterAll(async () => {
  await closePool();
});

describe('ProviderHealthService', () => {
  describe('recordSuccess', () => {
    it('creates a healthy record for a new provider', async () => {
      await seedProvider(PROV_1);
      await service.recordSuccess(PROV_1, 150);
      const health = await service.getHealth(PROV_1);
      expect(health).not.toBeNull();
      expect(health!.status).toBe('healthy');
      expect(health!.latencyMs).toBe(150);
      expect(health!.lastSuccessAt).not.toBeNull();
      expect(health!.lastFailureAt).toBeNull();
      expect(health!.message).toBeNull();
    });

    it('preserves previous lastFailureAt on success', async () => {
      await seedProvider(PROV_1);
      await service.recordFailure(PROV_1, 'timeout');
      const afterFailure = await service.getHealth(PROV_1);
      const failureTime = afterFailure!.lastFailureAt;

      await service.recordSuccess(PROV_1, 100);
      const afterSuccess = await service.getHealth(PROV_1);
      expect(afterSuccess!.status).toBe('healthy');
      expect(afterSuccess!.lastFailureAt).toEqual(failureTime);
    });
  });

  describe('recordFailure', () => {
    it('creates an unhealthy record for a new provider', async () => {
      await seedProvider(PROV_2);
      await service.recordFailure(PROV_2, 'connection refused');
      const health = await service.getHealth(PROV_2);
      expect(health).not.toBeNull();
      expect(health!.status).toBe('unhealthy');
      expect(health!.latencyMs).toBeNull();
      expect(health!.lastFailureAt).not.toBeNull();
      expect(health!.lastSuccessAt).toBeNull();
      expect(health!.message).toBe('connection refused');
    });

    it('preserves previous lastSuccessAt on failure', async () => {
      await seedProvider(PROV_2);
      await service.recordSuccess(PROV_2, 50);
      const afterSuccess = await service.getHealth(PROV_2);
      const successTime = afterSuccess!.lastSuccessAt;

      await service.recordFailure(PROV_2, 'error');
      const afterFailure = await service.getHealth(PROV_2);
      expect(afterFailure!.status).toBe('unhealthy');
      expect(afterFailure!.lastSuccessAt).toEqual(successTime);
    });
  });

  describe('getHealth', () => {
    it('returns null for unknown provider', async () => {
      expect(await service.getHealth(UNKNOWN)).toBeNull();
    });

    it('returns the health record for a known provider', async () => {
      await seedProvider(PROV_3);
      await service.recordSuccess(PROV_3, 200);
      const health = await service.getHealth(PROV_3);
      expect(health!.providerId).toBe(PROV_3);
    });
  });

  describe('getAllHealth', () => {
    it('returns empty array when no records', async () => {
      expect(await service.getAllHealth()).toEqual([]);
    });

    it('returns all health records', async () => {
      await seedProvider(PROV_A);
      await seedProvider(PROV_B);
      await service.recordSuccess(PROV_A, 100);
      await service.recordFailure(PROV_B, 'err');
      const all = await service.getAllHealth();
      expect(all).toHaveLength(2);
    });
  });

  describe('getHealthyProviders', () => {
    it('returns empty array when no healthy providers', async () => {
      await seedProvider(PROV_X);
      await service.recordFailure(PROV_X, 'err');
      expect(await service.getHealthyProviders()).toEqual([]);
    });

    it('returns only healthy providers', async () => {
      await seedProvider(PROV_A);
      await seedProvider(PROV_B);
      await seedProvider(PROV_C);
      await service.recordSuccess(PROV_A, 100);
      await service.recordFailure(PROV_B, 'err');
      await service.recordSuccess(PROV_C, 200);
      const healthy = await service.getHealthyProviders();
      expect(healthy).toHaveLength(2);
      expect(healthy.every((h) => h.status === 'healthy')).toBe(true);
    });
  });
});
