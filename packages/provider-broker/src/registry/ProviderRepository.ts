import type { Provider } from '@acds/core-types';

export interface ProviderRepository {
  create(provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider>;
  findById(id: string): Promise<Provider | null>;
  findAll(): Promise<Provider[]>;
  findByVendor(vendor: string): Promise<Provider[]>;
  findEnabled(): Promise<Provider[]>;
  update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider>;
  disable(id: string): Promise<Provider>;
  delete(id: string): Promise<void>;
}
