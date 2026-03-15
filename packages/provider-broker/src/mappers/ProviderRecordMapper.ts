import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

export interface ProviderRecord {
  id: string;
  name: string;
  vendor: string;
  auth_type: string;
  base_url: string;
  enabled: boolean;
  environment: string;
  created_at: Date;
  updated_at: Date;
}

export class ProviderRecordMapper {
  static toDomain(record: ProviderRecord): Provider {
    return {
      id: record.id,
      name: record.name,
      vendor: record.vendor as ProviderVendor,
      authType: record.auth_type as AuthType,
      baseUrl: record.base_url,
      enabled: record.enabled,
      environment: record.environment,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  static toRecord(provider: Provider): ProviderRecord {
    return {
      id: provider.id,
      name: provider.name,
      vendor: provider.vendor,
      auth_type: provider.authType,
      base_url: provider.baseUrl,
      enabled: provider.enabled,
      environment: provider.environment,
      created_at: provider.createdAt,
      updated_at: provider.updatedAt,
    };
  }
}
