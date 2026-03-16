import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runFastIntegrityCheck } from '../handlers/runFastIntegrityCheck.js';

const DEFAULT_INTERVAL_MS = 3_600_000; // 1 hour

export const fastIntegrityJob: JobDefinition = {
  name: 'grits-fast-integrity',
  intervalMs: parseInt(
    process.env.GRITS_FAST_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runFastIntegrityCheck,
};
