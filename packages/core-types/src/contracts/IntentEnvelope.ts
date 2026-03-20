import type { TaskType } from '../enums/TaskType.js';
import type { Modality } from '../enums/Modality.js';
import type { Sensitivity } from '../enums/Sensitivity.js';
import type { QualityTier } from '../enums/QualityTier.js';
import type { ContextSize } from '../enums/ContextSize.js';

export interface ExecutionConstraints {
  localOnly: boolean;
  externalAllowed: boolean;
  offlineRequired: boolean;
}

export interface IntentEnvelope {
  intentId: string;
  taskClass: TaskType;
  modality: Modality;
  sensitivity: Sensitivity;
  qualityTier: QualityTier;
  latencyTargetMs: number | null;
  costSensitivity: 'low' | 'medium' | 'high';
  executionConstraints: ExecutionConstraints;
  contextSizeEstimate: ContextSize;
  requiresSchemaValidation: boolean;
  origin: 'process_swarm' | 'manual' | 'api';
  timestamp: string;
}
