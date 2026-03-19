import type { ValidationResult } from './validation-types.js';

const DEFAULT_THRESHOLD_MS = 5000;

/**
 * Validates execution latency against a threshold.
 */
export function validateLatency(
  latencyMs: number,
  thresholdMs: number = DEFAULT_THRESHOLD_MS,
): ValidationResult {
  if (latencyMs <= thresholdMs * 0.8) {
    return {
      status: 'pass',
      severity: 'low',
      message: `Latency ${latencyMs}ms within threshold ${thresholdMs}ms`,
    };
  }

  if (latencyMs <= thresholdMs) {
    return {
      status: 'warning',
      severity: 'medium',
      message: `Latency ${latencyMs}ms approaching threshold ${thresholdMs}ms`,
      details: { latencyMs, thresholdMs, ratio: latencyMs / thresholdMs },
    };
  }

  return {
    status: 'fail',
    severity: 'high',
    message: `Latency ${latencyMs}ms exceeds threshold ${thresholdMs}ms`,
    details: { latencyMs, thresholdMs, ratio: latencyMs / thresholdMs },
  };
}
