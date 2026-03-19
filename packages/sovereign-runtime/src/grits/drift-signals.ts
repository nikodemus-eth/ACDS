import type { ValidationResult } from './validation-types.js';

/**
 * Drift signal types emitted by the runtime.
 */
export type DriftSignalType =
  | 'resolver_drift'     // same task resolves differently
  | 'schema_drift'       // output structure changed
  | 'latency_drift'      // latency exceeds learned baseline
  | 'fallback_drift'     // route that once resolved directly now requires fallback
  | 'capability_creep';  // previously local tasks begin invoking capabilities

export interface DriftSignal {
  type: DriftSignalType;
  methodId: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Emit a drift signal as a ValidationResult.
 */
export function emitDriftSignal(signal: DriftSignal): ValidationResult {
  return {
    status: 'drift',
    severity: signal.severity,
    message: `[${signal.type}] ${signal.description}`,
    details: {
      driftType: signal.type,
      methodId: signal.methodId,
      ...signal.details,
    },
  };
}

/**
 * Check for resolver drift: same task must resolve to same method.
 */
export function checkResolverDrift(
  expectedMethodId: string,
  actualMethodId: string,
  taskDescription: string,
): DriftSignal | undefined {
  if (expectedMethodId !== actualMethodId) {
    return {
      type: 'resolver_drift',
      methodId: actualMethodId,
      description: `Task "${taskDescription}" resolved to ${actualMethodId} instead of expected ${expectedMethodId}`,
      severity: 'high',
      timestamp: new Date().toISOString(),
      details: { expected: expectedMethodId, actual: actualMethodId },
    };
  }
  return undefined;
}

/**
 * Check for capability creep: local task should not invoke capabilities.
 */
export function checkCapabilityCreep(
  executionClass: string,
  expectedClass: string,
  methodId: string,
): DriftSignal | undefined {
  if (expectedClass === 'provider' && executionClass !== 'provider') {
    return {
      type: 'capability_creep',
      methodId,
      description: `Method ${methodId} expected to use provider but executed via ${executionClass}`,
      severity: 'high',
      timestamp: new Date().toISOString(),
      details: { expectedClass, actualClass: executionClass },
    };
  }
  return undefined;
}
