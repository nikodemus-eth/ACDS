import type { InstanceContext } from '@acds/core-types';

export interface NormalizedInstanceContext {
  retryCount: number;
  previousFailures: string[];
  deadlinePressure: boolean;
  humanReviewStatus: 'none' | 'pending' | 'completed';
  additionalMetadata: Record<string, unknown>;
}

export function normalizeInstanceContext(raw?: InstanceContext): NormalizedInstanceContext {
  return {
    retryCount: raw?.retryCount ?? 0,
    previousFailures: raw?.previousFailures ?? [],
    deadlinePressure: raw?.deadlinePressure ?? false,
    humanReviewStatus: raw?.humanReviewStatus ?? 'none',
    additionalMetadata: raw?.additionalMetadata ?? {},
  };
}
