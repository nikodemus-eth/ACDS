import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderHealthService } from './ProviderHealthService.js';
import type { ProviderHealthRepository } from './ProviderHealthRepository.js';
import type { ProviderHealth } from '@acds/core-types';

/** In-memory ProviderHealthRepository for testing. */
class InMemoryHealthRepository implements ProviderHealthRepository {
  private store = new Map<string, ProviderHealth>();

  async upsert(health: ProviderHealth): Promise<void> {
    this.store.set(health.providerId, health);
  }

  async findByProviderId(providerId: string): Promise<ProviderHealth | null> {
    return this.store.get(providerId) ?? null;
  }

  async findAll(): Promise<ProviderHealth[]> {
    return [...this.store.values()];
  }

  async findByStatus(status: string): Promise<ProviderHealth[]> {
    return [...this.store.values()].filter((h) => h.status === status);
  }
}

describe('ProviderHealthService', () => {
  let repo: InMemoryHealthRepository;
  let service: ProviderHealthService;

  beforeEach(() => {
    repo = new InMemoryHealthRepository();
    service = new ProviderHealthService(repo);
  });

  describe('recordSuccess', () => {
    it('creates a healthy record for a new provider', async () => {
      await service.recordSuccess('prov-1', 150);
      const health = await service.getHealth('prov-1');
      expect(health).not.toBeNull();
      expect(health!.status).toBe('healthy');
      expect(health!.latencyMs).toBe(150);
      expect(health!.lastSuccessAt).not.toBeNull();
      expect(health!.lastFailureAt).toBeNull();
      expect(health!.message).toBeNull();
    });

    it('preserves previous lastFailureAt on success', async () => {
      await service.recordFailure('prov-1', 'timeout');
      const afterFailure = await service.getHealth('prov-1');
      const failureTime = afterFailure!.lastFailureAt;

      await service.recordSuccess('prov-1', 100);
      const afterSuccess = await service.getHealth('prov-1');
      expect(afterSuccess!.status).toBe('healthy');
      expect(afterSuccess!.lastFailureAt).toEqual(failureTime);
    });
  });

  describe('recordFailure', () => {
    it('creates an unhealthy record for a new provider', async () => {
      await service.recordFailure('prov-2', 'connection refused');
      const health = await service.getHealth('prov-2');
      expect(health).not.toBeNull();
      expect(health!.status).toBe('unhealthy');
      expect(health!.latencyMs).toBeNull();
      expect(health!.lastFailureAt).not.toBeNull();
      expect(health!.lastSuccessAt).toBeNull();
      expect(health!.message).toBe('connection refused');
    });

    it('preserves previous lastSuccessAt on failure', async () => {
      await service.recordSuccess('prov-2', 50);
      const afterSuccess = await service.getHealth('prov-2');
      const successTime = afterSuccess!.lastSuccessAt;

      await service.recordFailure('prov-2', 'error');
      const afterFailure = await service.getHealth('prov-2');
      expect(afterFailure!.status).toBe('unhealthy');
      expect(afterFailure!.lastSuccessAt).toEqual(successTime);
    });
  });

  describe('getHealth', () => {
    it('returns null for unknown provider', async () => {
      expect(await service.getHealth('unknown')).toBeNull();
    });

    it('returns the health record for a known provider', async () => {
      await service.recordSuccess('prov-3', 200);
      const health = await service.getHealth('prov-3');
      expect(health!.providerId).toBe('prov-3');
    });
  });

  describe('getAllHealth', () => {
    it('returns empty array when no records', async () => {
      expect(await service.getAllHealth()).toEqual([]);
    });

    it('returns all health records', async () => {
      await service.recordSuccess('prov-a', 100);
      await service.recordFailure('prov-b', 'err');
      const all = await service.getAllHealth();
      expect(all).toHaveLength(2);
    });
  });

  describe('getHealthyProviders', () => {
    it('returns empty array when no healthy providers', async () => {
      await service.recordFailure('prov-x', 'err');
      expect(await service.getHealthyProviders()).toEqual([]);
    });

    it('returns only healthy providers', async () => {
      await service.recordSuccess('prov-a', 100);
      await service.recordFailure('prov-b', 'err');
      await service.recordSuccess('prov-c', 200);
      const healthy = await service.getHealthyProviders();
      expect(healthy).toHaveLength(2);
      expect(healthy.every((h) => h.status === 'healthy')).toBe(true);
    });
  });
});
