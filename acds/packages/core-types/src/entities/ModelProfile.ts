import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';
import { ProviderVendor } from '../enums/ProviderVendor.js';

export interface ModelProfile {
  id: string;
  name: string;
  description: string;
  vendor: ProviderVendor;
  modelId: string;
  supportedTaskTypes: TaskType[];
  supportedLoadTiers: LoadTier[];
  minimumCognitiveGrade: CognitiveGrade;
  contextWindow: number;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  localOnly: boolean;
  cloudAllowed: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
