/**
 * Structured telemetry event types for the ACDS runtime.
 */

export type TelemetryEventType =
  | "execution_started"
  | "execution_succeeded"
  | "execution_failed"
  | "policy_allowed"
  | "policy_denied"
  | "fallback_triggered"
  | "validation_passed"
  | "validation_failed";

export interface TelemetryEvent {
  readonly event_id: string;
  readonly event_type: TelemetryEventType;
  readonly timestamp: string;
  readonly execution_id: string;
  readonly source_type: "provider" | "capability" | "session";
  readonly source_id: string;
  readonly provider_id?: string;
  readonly method_id?: string;
  readonly execution_mode?: "local" | "controlled_remote" | "session";
  readonly latency_ms?: number;
  readonly status: "success" | "failure" | "blocked";
  readonly policy_path?: string;
  readonly validation_result?: string;
  readonly details?: Record<string, unknown>;
}

let eventCounter = 0;

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  eventCounter += 1;
  return `evt-${Date.now()}-${eventCounter}`;
}

let executionCounter = 0;

/**
 * Generate a unique execution ID.
 */
export function generateExecutionId(): string {
  executionCounter += 1;
  return `exec-${Date.now()}-${executionCounter}`;
}
