/**
 * Drift Signals — detects drift by comparing execution results against stored baselines.
 *
 * Drift types:
 * - Routing drift: same input + same registry -> different resolution path
 * - Schema drift: method output structure changes
 * - Latency drift: latency exceeds learned baseline
 * - Fallback drift: increasing fallback frequency
 * - Capability creep: previously-local tasks invoking capabilities
 */
import type { GritsValidationResult, GritsSignal } from "./validation-types.js";

// ---------------------------------------------------------------------------
// Baseline types
// ---------------------------------------------------------------------------
export interface RoutingBaseline {
  readonly task: string;
  readonly expected_method_id: string;
  readonly expected_provider_id: string;
}

export interface LatencyBaseline {
  readonly method_id: string;
  readonly mean_ms: number;
  readonly stddev_ms: number;
}

export interface FallbackBaseline {
  readonly method_id: string;
  readonly fallback_count: number;
  readonly total_executions: number;
}

export interface CapabilityBaseline {
  readonly task: string;
  readonly expected_source_class: "provider" | "capability" | "session";
}

// ---------------------------------------------------------------------------
// Drift detectors
// ---------------------------------------------------------------------------

/**
 * Detect routing drift: same task should resolve to same method.
 */
export function detectRoutingDrift(
  task: string,
  actual_method_id: string,
  actual_provider_id: string,
  baseline: RoutingBaseline,
): GritsValidationResult {
  const now = new Date().toISOString();
  const methodMatch = actual_method_id === baseline.expected_method_id;
  const providerMatch = actual_provider_id === baseline.expected_provider_id;

  if (methodMatch && providerMatch) {
    return {
      test_id: "DRIFT-ROUTING",
      passed: true,
      severity: "low",
      category: "drift",
      details: `Routing stable: ${task} -> ${actual_method_id}`,
      timestamp: now,
    };
  }

  return {
    test_id: "DRIFT-ROUTING",
    passed: false,
    severity: "critical",
    category: "drift",
    details: `Routing drift detected: ${task} expected ${baseline.expected_method_id}@${baseline.expected_provider_id}, got ${actual_method_id}@${actual_provider_id}`,
    timestamp: now,
  };
}

/**
 * Detect latency drift: execution time should stay within baseline tolerance.
 */
export function detectLatencyDrift(
  method_id: string,
  actual_ms: number,
  baseline: LatencyBaseline,
  toleranceSigma: number = 3,
): GritsValidationResult {
  const now = new Date().toISOString();
  const upperBound = baseline.mean_ms + toleranceSigma * baseline.stddev_ms;

  if (actual_ms <= upperBound) {
    return {
      test_id: "DRIFT-LATENCY",
      passed: true,
      severity: "low",
      category: "drift",
      details: `Latency stable: ${method_id} ${actual_ms}ms within baseline (mean=${baseline.mean_ms}ms, bound=${Math.round(upperBound)}ms)`,
      timestamp: now,
    };
  }

  return {
    test_id: "DRIFT-LATENCY",
    passed: false,
    severity: "high",
    category: "drift",
    details: `Latency drift: ${method_id} ${actual_ms}ms exceeds baseline bound ${Math.round(upperBound)}ms`,
    timestamp: now,
  };
}

/**
 * Detect fallback drift: fallback frequency should not increase.
 */
export function detectFallbackDrift(
  method_id: string,
  current_fallback_count: number,
  current_total: number,
  baseline: FallbackBaseline,
  thresholdRatio: number = 0.1,
): GritsValidationResult {
  const now = new Date().toISOString();
  const baselineRatio =
    baseline.total_executions > 0
      ? baseline.fallback_count / baseline.total_executions
      : 0;
  const currentRatio = current_total > 0 ? current_fallback_count / current_total : 0;

  if (currentRatio <= baselineRatio + thresholdRatio) {
    return {
      test_id: "DRIFT-FALLBACK",
      passed: true,
      severity: "low",
      category: "drift",
      details: `Fallback stable: ${method_id} ratio ${(currentRatio * 100).toFixed(1)}%`,
      timestamp: now,
    };
  }

  return {
    test_id: "DRIFT-FALLBACK",
    passed: false,
    severity: "high",
    category: "drift",
    details: `Fallback drift: ${method_id} ratio ${(currentRatio * 100).toFixed(1)}% exceeds baseline ${(baselineRatio * 100).toFixed(1)}% + threshold`,
    timestamp: now,
  };
}

/**
 * Detect capability creep: tasks that were provider-local should not migrate to capabilities.
 */
export function detectCapabilityCreep(
  task: string,
  actual_source_class: "provider" | "capability" | "session",
  baseline: CapabilityBaseline,
): GritsValidationResult {
  const now = new Date().toISOString();

  if (actual_source_class === baseline.expected_source_class) {
    return {
      test_id: "DRIFT-CAPABILITY-CREEP",
      passed: true,
      severity: "low",
      category: "drift",
      details: `Source class stable: ${task} -> ${actual_source_class}`,
      timestamp: now,
    };
  }

  // Escalation from provider to capability is creep
  if (
    baseline.expected_source_class === "provider" &&
    actual_source_class === "capability"
  ) {
    return {
      test_id: "DRIFT-CAPABILITY-CREEP",
      passed: false,
      severity: "critical",
      category: "drift",
      details: `Capability creep: ${task} migrated from ${baseline.expected_source_class} to ${actual_source_class}`,
      timestamp: now,
    };
  }

  return {
    test_id: "DRIFT-CAPABILITY-CREEP",
    passed: false,
    severity: "high",
    category: "drift",
    details: `Source class drift: ${task} expected ${baseline.expected_source_class}, got ${actual_source_class}`,
    timestamp: now,
  };
}

/**
 * Convert a drift result to a signal.
 */
export function driftSignal(result: GritsValidationResult): GritsSignal {
  if (result.passed) return "pass";
  if (result.category === "drift") return "drift";
  return "fail";
}
