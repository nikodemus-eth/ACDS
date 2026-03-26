import { fastIntegrityJob } from '../jobs/fastIntegrityJob.js';
import { dailyIntegrityJob } from '../jobs/dailyIntegrityJob.js';
import { releaseIntegrityJob } from '../jobs/releaseIntegrityJob.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

export function registerJobs(): JobDefinition[] {
  if (process.env.GRITS_RELEASE_MODE === 'true') {
    return [releaseIntegrityJob];
  }

  return [
    fastIntegrityJob,
    dailyIntegrityJob,
  ];
}
