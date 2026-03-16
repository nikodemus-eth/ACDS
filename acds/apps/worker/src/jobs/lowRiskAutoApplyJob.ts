import type { JobDefinition } from '../bootstrap/registerJobs.js';
import { runLowRiskAutoApply } from '../handlers/runLowRiskAutoApply.js';

const DEFAULT_INTERVAL_MS = 600_000; // 600 seconds

export const lowRiskAutoApplyJob: JobDefinition = {
  name: 'low-risk-auto-apply',
  intervalMs: parseInt(
    process.env.LOW_RISK_AUTO_APPLY_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10,
  ),
  handler: runLowRiskAutoApply,
};
