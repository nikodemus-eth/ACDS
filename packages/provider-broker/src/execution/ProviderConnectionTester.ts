import type { Provider } from '@acds/core-types';
import type { AdapterConnectionResult, AdapterConfig } from '@acds/provider-adapters';
import type { AdapterResolver } from './AdapterResolver.js';

export class ProviderConnectionTester {
  constructor(private readonly adapterResolver: AdapterResolver) {}

  async testConnection(provider: Provider, apiKey?: string): Promise<AdapterConnectionResult> {
    const adapter = this.adapterResolver.resolve(provider.vendor);
    const config: AdapterConfig = {
      baseUrl: provider.baseUrl,
      apiKey,
      timeout: 15000,
    };
    return adapter.testConnection(config);
  }
}
