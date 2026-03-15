import type { Provider } from '@acds/core-types';
import type { AdapterRequest, AdapterResponse, AdapterConfig } from '@acds/provider-adapters';
import type { AdapterResolver } from './AdapterResolver.js';
import { ProviderExecutionError } from './ProviderExecutionError.js';

export class ProviderExecutionProxy {
  constructor(private readonly adapterResolver: AdapterResolver) {}

  async execute(
    provider: Provider,
    request: AdapterRequest,
    apiKey?: string
  ): Promise<AdapterResponse> {
    if (!provider.enabled) {
      throw new ProviderExecutionError({
        message: `Provider ${provider.id} is disabled`,
        code: 'PROVIDER_DISABLED',
        providerId: provider.id,
        retryable: false,
      });
    }

    const adapter = this.adapterResolver.resolve(provider.vendor);
    const config: AdapterConfig = {
      baseUrl: provider.baseUrl,
      apiKey,
      timeout: 30000,
    };

    const validation = adapter.validateConfig(config);
    if (!validation.valid) {
      throw new ProviderExecutionError({
        message: `Invalid provider configuration: ${validation.errors.join(', ')}`,
        code: 'INVALID_CONFIG',
        providerId: provider.id,
        retryable: false,
      });
    }

    try {
      return await adapter.execute(config, request);
    } catch (error) {
      throw new ProviderExecutionError({
        message: `Execution failed for provider ${provider.id}`,
        code: 'EXECUTION_FAILED',
        providerId: provider.id,
        retryable: true,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
}
