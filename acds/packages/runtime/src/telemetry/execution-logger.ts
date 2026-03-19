/**
 * Execution Logger — stores telemetry events in memory.
 *
 * All events pass through redaction before storage.
 */
import type { TelemetryEvent } from "./event-types.js";
import { redact } from "./redaction.js";

export class ExecutionLogger {
  private readonly events: TelemetryEvent[] = [];

  /**
   * Log a telemetry event. The event is redacted before storage.
   */
  log(event: TelemetryEvent): void {
    this.events.push(redact(event));
  }

  /**
   * Get all stored events (already redacted).
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get events for a specific execution ID.
   */
  getEventsForExecution(execution_id: string): TelemetryEvent[] {
    return this.events.filter((e) => e.execution_id === execution_id);
  }

  /**
   * Clear all stored events.
   */
  clear(): void {
    this.events.length = 0;
  }
}
