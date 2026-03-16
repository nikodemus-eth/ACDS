import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runReleaseIntegrityCheck } from '../handlers/runReleaseIntegrityCheck.js';

export const releaseIntegrityJob: JobDefinition = {
  name: 'grits-release-integrity',
  intervalMs: 0, // Run once — triggered by GRITS_RELEASE_MODE env var
  handler: runReleaseIntegrityCheck,
};
