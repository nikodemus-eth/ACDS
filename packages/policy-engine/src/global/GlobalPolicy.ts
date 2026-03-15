import type { ProviderVendor, TaskType, LoadTier, CognitiveGrade } from '@acds/core-types';

export interface GlobalPolicy {
  id: string;
  allowedVendors: ProviderVendor[];
  blockedVendors: ProviderVendor[];
  defaultPrivacy: 'local_only' | 'cloud_allowed' | 'cloud_preferred';
  defaultCostSensitivity: 'low' | 'medium' | 'high';
  structuredOutputRequiredForGrades: CognitiveGrade[];
  traceabilityRequiredForGrades: CognitiveGrade[];
  maxLatencyMsByLoadTier: Partial<Record<LoadTier, number>>;
  localPreferredTaskTypes: TaskType[];
  cloudRequiredLoadTiers: LoadTier[];
  enabled: boolean;
  updatedAt: Date;
}
