import type { CognitiveGrade } from '@acds/core-types';

export interface ProcessPolicy {
  id: string;
  application: string;
  process: string;
  step: string | null;
  defaultModelProfileId: string | null;
  defaultTacticProfileId: string | null;
  allowedModelProfileIds: string[] | null;
  blockedModelProfileIds: string[] | null;
  allowedTacticProfileIds: string[] | null;
  privacyOverride: 'local_only' | 'cloud_allowed' | 'cloud_preferred' | null;
  costSensitivityOverride: 'low' | 'medium' | 'high' | null;
  forceEscalationForGrades: CognitiveGrade[] | null;
  enabled: boolean;
  updatedAt: Date;
}
