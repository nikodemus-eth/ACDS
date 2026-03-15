import { TaskType } from '../enums/TaskType.js';
import { LoadTier } from '../enums/LoadTier.js';
import { CognitiveGrade } from '../enums/CognitiveGrade.js';

export interface ModelProfile {
  id: string;
  name: string;
  description: string;
  supportedTaskTypes: TaskType[];
  supportedLoadTiers: LoadTier[];
  minimumCognitiveGrade: CognitiveGrade;
  localOnly: boolean;
  cloudAllowed: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
