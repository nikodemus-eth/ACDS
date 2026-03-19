/**
 * Latency Validator — validates execution latency against configurable thresholds.
 *
 * Default thresholds: 5000ms for local, 10000ms for remote.
 */
import type { GritsValidationResult, GritsSignal } from "./validation-types.js";

export interface LatencyThresholds {
  readonly local_ms: number;
  readonly remote_ms: number;
}

const DEFAULT_THRESHOLDS: LatencyThresholds = {
  local_ms: 5000,
  remote_ms: 10000,
};

/**
 * Validate execution latency against thresholds.
 */
export function validateLatency(
  latency_ms: number,
  execution_mode: "local" | "controlled_remote" | "session",
  testId: string,
  thresholds: LatencyThresholds = DEFAULT_THRESHOLDS,
): GritsValidationResult {
  const now = new Date().toISOString();
  const threshold =
    execution_mode === "local" ? thresholds.local_ms : thresholds.remote_ms;
  const ratio = latency_ms / threshold;

  if (latency_ms > threshold) {
    return {
      test_id: testId,
      passed: false,
      severity: "high",
      category: "latency",
      details: `Latency ${latency_ms}ms exceeds ${execution_mode} threshold ${threshold}ms`,
      timestamp: now,
    };
  }

  if (ratio > 0.8) {
    return {
      test_id: testId,
      passed: true,
      severity: "medium",
      category: "latency",
      details: `Latency ${latency_ms}ms approaching ${execution_mode} threshold ${threshold}ms (${Math.round(ratio * 100)}%)`,
      timestamp: now,
    };
  }

  return {
    test_id: testId,
    passed: true,
    severity: "low",
    category: "latency",
    details: `Latency ${latency_ms}ms within ${execution_mode} threshold ${threshold}ms`,
    timestamp: now,
  };
}

/**
 * Convert a latency validation result to a signal.
 */
export function latencySignal(result: GritsValidationResult): GritsSignal {
  if (!result.passed) return "fail";
  if (result.severity === "medium") return "warning";
  return "pass";
}
