import { z } from 'zod';
import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';

export const tacticProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string(),
  executionMethod: z.string().min(1),
  supportedTaskTypes: z.array(z.nativeEnum(TaskType)).min(1),
  supportedLoadTiers: z.array(z.nativeEnum(LoadTier)).min(1),
  multiStage: z.boolean(),
  requiresStructuredOutput: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type TacticProfileInput = z.infer<typeof tacticProfileSchema>;
