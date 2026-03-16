import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';

export interface TacticProfile {
  id: string;
  name: string;
  description: string;
  executionMethod: string;
  systemPromptTemplate: string;
  outputSchema?: Record<string, unknown>;
  maxRetries: number;
  temperature: number;
  topP: number;
  supportedTaskTypes: TaskType[];
  supportedLoadTiers: LoadTier[];
  multiStage: boolean;
  requiresStructuredOutput: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
