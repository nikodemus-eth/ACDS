import type { ProviderHealth } from '@acds/core-types';
import type { ProviderHealthRepository } from './ProviderHealthRepository.js';

export class ProviderHealthService {
  constructor(private readonly repository: ProviderHealthRepository) {}

  async recordSuccess(providerId: string, latencyMs: number): Promise<void> {
    const now = new Date();
    const health: ProviderHealth = {
      providerId,
      status: 'healthy',
      lastTestAt: now,
      lastSuccessAt: now,
      lastFailureAt: (await this.repository.findByProviderId(providerId))?.lastFailureAt ?? null,
      latencyMs,
      message: null,
    };
    await this.repository.upsert(health);
  }

  async recordFailure(providerId: string, message: string): Promise<void> {
    const now = new Date();
    const existing = await this.repository.findByProviderId(providerId);
    const health: ProviderHealth = {
      providerId,
      status: 'unhealthy',
      lastTestAt: now,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lastFailureAt: now,
      latencyMs: null,
      message,
    };
    await this.repository.upsert(health);
  }

  async getHealth(providerId: string): Promise<ProviderHealth | null> {
    return this.repository.findByProviderId(providerId);
  }

  async getAllHealth(): Promise<ProviderHealth[]> {
    return this.repository.findAll();
  }

  async getHealthyProviders(): Promise<ProviderHealth[]> {
    return this.repository.findByStatus('healthy');
  }
}
