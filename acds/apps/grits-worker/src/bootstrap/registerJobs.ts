import { fastIntegrityJob } from '../jobs/fastIntegrityJob.js';
import { dailyIntegrityJob } from '../jobs/dailyIntegrityJob.js';
import { releaseIntegrityJob } from '../jobs/releaseIntegrityJob.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

export function registerJobs(): JobDefinition[] {
  const jobs: JobDefinition[] = [
    fastIntegrityJob,
    dailyIntegrityJob,
  ];

  if (process.env.GRITS_RELEASE_MODE === 'true') {
    jobs.push(releaseIntegrityJob);
  }

  return jobs;
}
