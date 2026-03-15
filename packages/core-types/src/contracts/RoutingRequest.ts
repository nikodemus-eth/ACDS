import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';
import { DecisionPosture } from '../enums/DecisionPosture.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';

export interface RoutingConstraints {
  privacy: 'local_only' | 'cloud_allowed' | 'cloud_preferred';
  maxLatencyMs: number | null;
  costSensitivity: 'low' | 'medium' | 'high';
  structuredOutputRequired: boolean;
  traceabilityRequired: boolean;
}

export interface InstanceContext {
  retryCount: number;
  previousFailures: string[];
  deadlinePressure: boolean;
  humanReviewStatus: 'none' | 'pending' | 'completed';
  additionalMetadata: Record<string, unknown>;
}

export interface RoutingRequest {
  application: string;
  process: string;
  step: string;
  taskType: TaskType;
  loadTier: LoadTier;
  decisionPosture: DecisionPosture;
  cognitiveGrade: CognitiveGrade;
  constraints: RoutingConstraints;
  instanceContext?: InstanceContext;
}
