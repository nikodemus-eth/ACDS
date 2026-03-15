import { ProviderVendor } from '../enums/ProviderVendor.js';
import { AuthType } from '../enums/AuthType.js';

export interface Provider {
  id: string;
  name: string;
  vendor: ProviderVendor;
  authType: AuthType;
  baseUrl: string;
  enabled: boolean;
  environment: string;
  createdAt: Date;
  updatedAt: Date;
}
