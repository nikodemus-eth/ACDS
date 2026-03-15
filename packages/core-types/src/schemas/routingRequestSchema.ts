import { z } from 'zod';
import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';
import { DecisionPosture } from '../enums/DecisionPosture.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';

export const routingConstraintsSchema = z.object({
  privacy: z.enum(['local_only', 'cloud_allowed', 'cloud_preferred']),
  maxLatencyMs: z.number().positive().nullable(),
  costSensitivity: z.enum(['low', 'medium', 'high']),
  structuredOutputRequired: z.boolean(),
  traceabilityRequired: z.boolean(),
});

export const instanceContextSchema = z.object({
  retryCount: z.number().int().min(0),
  previousFailures: z.array(z.string()),
  deadlinePressure: z.boolean(),
  humanReviewStatus: z.enum(['none', 'pending', 'completed']),
  additionalMetadata: z.record(z.unknown()),
});

export const routingRequestSchema = z.object({
  application: z.string().min(1),
  process: z.string().min(1),
  step: z.string().min(1),
  taskType: z.nativeEnum(TaskType),
  loadTier: z.nativeEnum(LoadTier),
  decisionPosture: z.nativeEnum(DecisionPosture),
  cognitiveGrade: z.nativeEnum(CognitiveGrade),
  constraints: routingConstraintsSchema,
  instanceContext: instanceContextSchema.optional(),
});

export type RoutingRequestInput = z.infer<typeof routingRequestSchema>;
