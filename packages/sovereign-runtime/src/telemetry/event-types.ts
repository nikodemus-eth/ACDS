import type { SourceClass } from '../domain/source-types.js';

/**
 * Structured execution log event — emitted for every method execution.
 */
export interface ExecutionLogEvent {
  executionId: string;
  sourceType: SourceClass;
  sourceId: string;
  providerId: string;
  methodId: string;
  executionMode: 'local' | 'controlled_remote' | 'session';
  latencyMs: number;
  status: 'success' | 'failure' | 'timeout';
  validationResult?: 'pass' | 'fail' | 'warn';
  policyPath?: string;
  timestamp: string;
}

/**
 * Policy audit event — emitted when a policy decision is made.
 */
export interface PolicyAuditEvent {
  executionId: string;
  decision: 'allow' | 'deny';
  reason: string;
  sourceType: SourceClass;
  methodId?: string;
  constraints?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Fallback audit event — emitted when fallback is triggered.
 */
export interface FallbackAuditEvent {
  executionId: string;
  primaryProviderId: string;
  primaryMethodId: string;
  fallbackProviderId: string;
  fallbackMethodId: string;
  reason: string;
  sameClass: boolean;
  timestamp: string;
}
