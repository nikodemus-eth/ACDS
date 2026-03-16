import type { ProviderHealth } from '@acds/core-types';

export interface ProviderHealthRepository {
  upsert(health: ProviderHealth): Promise<void>;
  findByProviderId(providerId: string): Promise<ProviderHealth | null>;
  findAll(): Promise<ProviderHealth[]>;
  findByStatus(status: string): Promise<ProviderHealth[]>;
}
