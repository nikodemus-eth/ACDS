import type { Provider } from '@acds/core-types';
import type { ProviderRepository } from './ProviderRepository.js';
import type { ProviderValidationService } from './ProviderValidationService.js';

export class ProviderRegistryService {
  constructor(
    private readonly repository: ProviderRepository,
    private readonly validator: ProviderValidationService
  ) {}

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const errors = this.validator.validate(input);
    if (errors.length > 0) {
      throw new Error(`Provider validation failed: ${errors.join(', ')}`);
    }
    return this.repository.create(input);
  }

  async getById(id: string): Promise<Provider | null> {
    return this.repository.findById(id);
  }

  async listAll(): Promise<Provider[]> {
    return this.repository.findAll();
  }

  async listEnabled(): Promise<Provider[]> {
    return this.repository.findEnabled();
  }

  async update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }
    return this.repository.update(id, updates);
  }

  async disable(id: string): Promise<Provider> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error(`Provider not found: ${id}`);
    }
    return this.repository.disable(id);
  }
}
