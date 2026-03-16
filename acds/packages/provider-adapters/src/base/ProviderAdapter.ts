import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from './AdapterTypes.js';

export interface ProviderAdapter {
  readonly vendorName: string;

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] };

  testConnection(config: AdapterConfig): Promise<AdapterConnectionResult>;

  execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse>;
}
