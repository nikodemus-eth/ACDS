import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runExecutionScoring } from '../handlers/runExecutionScoring.js';

const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds

export const executionScoringJob: JobDefinition = {
  name: 'execution-scoring',
  intervalMs: parseInt(
    process.env.EXECUTION_SCORING_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runExecutionScoring,
};
