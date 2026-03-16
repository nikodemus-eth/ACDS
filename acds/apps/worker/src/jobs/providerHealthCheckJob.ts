import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runProviderHealthChecks } from '../handlers/runProviderHealthChecks.js';

const DEFAULT_INTERVAL_MS = 60_000; // 60 seconds

export const providerHealthCheckJob: JobDefinition = {
  name: 'provider-health-check',
  intervalMs: parseInt(
    process.env.HEALTH_CHECK_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10
  ),
  handler: runProviderHealthChecks,
};
