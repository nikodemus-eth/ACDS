import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runDailyIntegrityCheck } from '../handlers/runDailyIntegrityCheck.js';

const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

export const dailyIntegrityJob: JobDefinition = {
  name: 'grits-daily-integrity',
  intervalMs: parseInt(
    process.env.GRITS_DAILY_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runDailyIntegrityCheck,
};
