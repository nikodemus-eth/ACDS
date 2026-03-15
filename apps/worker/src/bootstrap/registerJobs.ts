import { providerHealthCheckJob } from '../jobs/providerHealthCheckJob.js';
import { staleExecutionCleanupJob } from '../jobs/staleExecutionCleanupJob.js';

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
  ];

  return jobs;
}
