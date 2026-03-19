import type { ExecutionLogEvent, PolicyAuditEvent, FallbackAuditEvent } from './event-types.js';
import { redactLogEvent } from './redaction.js';

/**
 * Structured execution logger.
 * Collects all execution, policy, and fallback events for observability.
 * All events pass through the redaction layer before storage.
 */
export class ExecutionLogger {
  private readonly executionLogs: ExecutionLogEvent[] = [];
  private readonly policyLogs: PolicyAuditEvent[] = [];
  private readonly fallbackLogs: FallbackAuditEvent[] = [];

  logExecution(event: ExecutionLogEvent): void {
    this.executionLogs.push(redactLogEvent(event));
  }

  logPolicyDecision(event: PolicyAuditEvent): void {
    this.policyLogs.push(redactLogEvent(event));
  }

  logFallback(event: FallbackAuditEvent): void {
    this.fallbackLogs.push(redactLogEvent(event));
  }

  getExecutionLogs(): ReadonlyArray<ExecutionLogEvent> {
    return this.executionLogs;
  }

  getPolicyLogs(): ReadonlyArray<PolicyAuditEvent> {
    return this.policyLogs;
  }

  getFallbackLogs(): ReadonlyArray<FallbackAuditEvent> {
    return this.fallbackLogs;
  }

  clear(): void {
    this.executionLogs.length = 0;
    this.policyLogs.length = 0;
    this.fallbackLogs.length = 0;
  }
}
