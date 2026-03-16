import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { cleanupStaleExecutions } from '../handlers/cleanupStaleExecutions.js';

const DEFAULT_INTERVAL_MS = 300_000; // 300 seconds (5 minutes)

export const staleExecutionCleanupJob: JobDefinition = {
  name: 'stale-execution-cleanup',
  intervalMs: parseInt(
    process.env.STALE_CLEANUP_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10
  ),
  handler: cleanupStaleExecutions,
};
