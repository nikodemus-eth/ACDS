/**
 * Audit Logger — separate audit trail for policy decisions and fallback events.
 *
 * Same interface pattern as ExecutionLogger but filtered to governance events only.
 */
import type { TelemetryEvent, TelemetryEventType } from "./event-types.js";
import { redact } from "./redaction.js";

const AUDIT_EVENT_TYPES: ReadonlySet<TelemetryEventType> = new Set([
  "policy_allowed",
  "policy_denied",
  "fallback_triggered",
  "validation_passed",
  "validation_failed",
]);

export class AuditLogger {
  private readonly events: TelemetryEvent[] = [];

  /**
   * Log a telemetry event if it is a governance/audit event.
   * Non-audit events are silently ignored.
   */
  log(event: TelemetryEvent): void {
    if (AUDIT_EVENT_TYPES.has(event.event_type)) {
      this.events.push(redact(event));
    }
  }

  /**
   * Get all stored audit events.
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get audit events for a specific execution ID.
   */
  getEventsForExecution(execution_id: string): TelemetryEvent[] {
    return this.events.filter((e) => e.execution_id === execution_id);
  }

  /**
   * Clear all stored audit events.
   */
  clear(): void {
    this.events.length = 0;
  }
}
