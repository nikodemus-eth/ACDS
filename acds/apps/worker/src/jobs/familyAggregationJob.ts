import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runFamilyAggregation } from '../handlers/runFamilyAggregation.js';

const DEFAULT_INTERVAL_MS = 120_000; // 120 seconds

export const familyAggregationJob: JobDefinition = {
  name: 'family-aggregation',
  intervalMs: parseInt(
    process.env.FAMILY_AGGREGATION_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runFamilyAggregation,
};
