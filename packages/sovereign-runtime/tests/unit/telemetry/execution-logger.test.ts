import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLogger } from '../../../src/telemetry/execution-logger.js';
import type { ExecutionLogEvent, PolicyAuditEvent, FallbackAuditEvent } from '../../../src/telemetry/event-types.js';

describe('ExecutionLogger', () => {
  let logger: ExecutionLogger;

  beforeEach(() => {
    logger = new ExecutionLogger();
  });

  it('logs structured execution event', () => {
    const event: ExecutionLogEvent = {
      executionId: 'exec-001',
      sourceType: 'provider',
      sourceId: 'apple-intelligence-runtime',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local',
      latencyMs: 15,
      status: 'success',
      validationResult: 'pass',
      timestamp: new Date().toISOString(),
    };

    logger.logExecution(event);
    const logs = logger.getExecutionLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].executionId).toBe('exec-001');
    expect(logs[0].sourceType).toBe('provider');
  });

  it('logs policy decision event', () => {
    const event: PolicyAuditEvent = {
      executionId: 'exec-002',
      decision: 'deny',
      reason: 'Capability invocation blocked by local_only constraint',
      sourceType: 'capability',
      methodId: 'openai.summarize',
      timestamp: new Date().toISOString(),
    };

    logger.logPolicyDecision(event);
    expect(logger.getPolicyLogs()).toHaveLength(1);
    expect(logger.getPolicyLogs()[0].decision).toBe('deny');
  });

  it('logs fallback event', () => {
    const event: FallbackAuditEvent = {
      executionId: 'exec-003',
      primaryProviderId: 'apple-intelligence-runtime',
      primaryMethodId: 'apple.foundation_models.summarize',
      fallbackProviderId: 'ollama-local',
      fallbackMethodId: 'ollama.summarize',
      reason: 'Primary provider unavailable',
      sameClass: true,
      timestamp: new Date().toISOString(),
    };

    logger.logFallback(event);
    expect(logger.getFallbackLogs()).toHaveLength(1);
    expect(logger.getFallbackLogs()[0].sameClass).toBe(true);
  });

  it('clears all logs', () => {
    logger.logExecution({
      executionId: 'x', sourceType: 'provider', sourceId: 'x', providerId: 'x',
      methodId: 'x', executionMode: 'local', latencyMs: 1, status: 'success',
      timestamp: new Date().toISOString(),
    });
    logger.clear();
    expect(logger.getExecutionLogs()).toHaveLength(0);
  });
});
