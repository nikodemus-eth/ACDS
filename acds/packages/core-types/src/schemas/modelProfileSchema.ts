import { z } from 'zod';
import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';
import { ProviderVendor } from '../enums/ProviderVendor.js';

export const modelProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string(),
  vendor: z.nativeEnum(ProviderVendor),
  modelId: z.string().min(1),
  supportedTaskTypes: z.array(z.nativeEnum(TaskType)).min(1),
  supportedLoadTiers: z.array(z.nativeEnum(LoadTier)).min(1),
  minimumCognitiveGrade: z.nativeEnum(CognitiveGrade),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  costPer1kInput: z.number().nonnegative(),
  costPer1kOutput: z.number().nonnegative(),
  localOnly: z.boolean(),
  cloudAllowed: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ModelProfileInput = z.infer<typeof modelProfileSchema>;
