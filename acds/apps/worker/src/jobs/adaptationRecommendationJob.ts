import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runAdaptationRecommendations } from '../handlers/runAdaptationRecommendations.js';

const DEFAULT_INTERVAL_MS = 600_000; // 600 seconds

export const adaptationRecommendationJob: JobDefinition = {
  name: 'adaptation-recommendation',
  intervalMs: parseInt(
    process.env.ADAPTATION_RECOMMENDATION_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runAdaptationRecommendations,
};
