import type { Provider } from '@acds/core-types';
import type { ProviderRepository } from '@acds/provider-broker';
import { randomUUID } from 'node:crypto';

/**
 * Real in-memory implementation of ProviderRepository for tests.
 * No mocks — stores providers in a plain array with real filtering logic.
 */
export class InMemoryProviderRepository implements ProviderRepository {
  private providers: Provider[];

  constructor(seed: Provider[] = []) {
    this.providers = seed.map((p) => ({ ...p }));
  }

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const provider: Provider = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.providers.push(provider);
    return provider;
  }

  async findById(id: string): Promise<Provider | null> {
    return this.providers.find((p) => p.id === id) ?? null;
  }

  async findAll(): Promise<Provider[]> {
    return [...this.providers];
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.providers.filter((p) => p.vendor === vendor);
  }

  async findEnabled(): Promise<Provider[]> {
    return this.providers.filter((p) => p.enabled);
  }

  async update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider> {
    const idx = this.providers.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Provider ${id} not found`);
    this.providers[idx] = { ...this.providers[idx], ...updates, updatedAt: new Date() };
    return this.providers[idx];
  }

  async disable(id: string): Promise<Provider> {
    return this.update(id, { enabled: false });
  }

  async delete(id: string): Promise<void> {
    this.providers = this.providers.filter((p) => p.id !== id);
  }
}
