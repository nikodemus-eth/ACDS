import type { ProviderVendor, TaskType, CognitiveGrade } from '@acds/core-types';

export interface ApplicationPolicy {
  id: string;
  application: string;
  allowedVendors: ProviderVendor[] | null;
  blockedVendors: ProviderVendor[] | null;
  privacyOverride: 'local_only' | 'cloud_allowed' | 'cloud_preferred' | null;
  costSensitivityOverride: 'low' | 'medium' | 'high' | null;
  preferredModelProfileIds: string[] | null;
  blockedModelProfileIds: string[] | null;
  localPreferredTaskTypes: TaskType[] | null;
  structuredOutputRequiredForGrades: CognitiveGrade[] | null;
  enabled: boolean;
  updatedAt: Date;
}
