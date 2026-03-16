import { z } from 'zod';
import { ProviderVendor } from '../enums/ProviderVendor.js';
import { AuthType } from '../enums/AuthType.js';

export const providerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  vendor: z.nativeEnum(ProviderVendor),
  authType: z.nativeEnum(AuthType),
  baseUrl: z.string().url(),
  enabled: z.boolean(),
  environment: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ProviderInput = z.infer<typeof providerSchema>;

export const createProviderSchema = providerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
