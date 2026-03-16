import { providerHealthCheckJob } from '../jobs/providerHealthCheckJob.js';
import { staleExecutionCleanupJob } from '../jobs/staleExecutionCleanupJob.js';
import { executionScoringJob } from '../jobs/executionScoringJob.js';
import { familyAggregationJob } from '../jobs/familyAggregationJob.js';
import { plateauDetectionJob } from '../jobs/plateauDetectionJob.js';
import { adaptationRecommendationJob } from '../jobs/adaptationRecommendationJob.js';
import { lowRiskAutoApplyJob } from '../jobs/lowRiskAutoApplyJob.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

/**
 * Wires all job definitions to their handlers and returns the full job registry.
 */
export function registerJobs(): JobDefinition[] {
  const jobs: JobDefinition[] = [
    providerHealthCheckJob,
    staleExecutionCleanupJob,
    executionScoringJob,
    familyAggregationJob,
    plateauDetectionJob,
    adaptationRecommendationJob,
    lowRiskAutoApplyJob,
  ];

  return jobs;
}
