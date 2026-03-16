import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runPlateauDetection } from '../handlers/runPlateauDetection.js';

const DEFAULT_INTERVAL_MS = 300_000; // 300 seconds

export const plateauDetectionJob: JobDefinition = {
  name: 'plateau-detection',
  intervalMs: parseInt(
    process.env.PLATEAU_DETECTION_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runPlateauDetection,
};
