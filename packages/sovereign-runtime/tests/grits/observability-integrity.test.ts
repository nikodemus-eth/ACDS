import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLogger } from '../../src/telemetry/execution-logger.js';
import { redactLogEvent } from '../../src/telemetry/redaction.js';
import type { ExecutionLogEvent, PolicyAuditEvent, FallbackAuditEvent } from '../../src/telemetry/event-types.js';

describe('GRITS Observability Integrity', () => {
  let logger: ExecutionLogger;

  beforeEach(() => {
    logger = new ExecutionLogger();
  });

  it('GRITS-OBS-001: every execution emits structured log', () => {
    const event: ExecutionLogEvent = {
      executionId: 'exec-001',
      sourceType: 'provider',
      sourceId: 'apple-intelligence-runtime',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local',
      latencyMs: 42,
      status: 'success',
      timestamp: new Date().toISOString(),
    };

    logger.logExecution(event);
    const logs = logger.getExecutionLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].executionId).toBe('exec-001');
  });

  it('GRITS-OBS-002: every execution includes required fields', () => {
    const event: ExecutionLogEvent = {
      executionId: 'exec-002',
      sourceType: 'provider',
      sourceId: 'apple-intelligence-runtime',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local',
      latencyMs: 55,
      status: 'success',
      timestamp: new Date().toISOString(),
    };

    logger.logExecution(event);
    const logged = logger.getExecutionLogs()[0];

    expect(logged.executionId).toBeDefined();
    expect(logged.sourceType).toBeDefined();
    expect(logged.sourceId).toBeDefined();
    expect(logged.methodId).toBeDefined();
    expect(typeof logged.latencyMs).toBe('number');
    expect(logged.status).toBeDefined();
  });

  it('GRITS-OBS-003: policy decisions emit separate audit events', () => {
    const event: PolicyAuditEvent = {
      executionId: 'exec-003',
      decision: 'deny',
      reason: 'Tier D method blocked in local-only sovereign mode',
      sourceType: 'provider',
      methodId: 'apple.cloud.augmented',
      constraints: { localOnly: true },
      timestamp: new Date().toISOString(),
    };

    logger.logPolicyDecision(event);
    const logs = logger.getPolicyLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].decision).toBe('deny');
    expect(logs[0].reason).toContain('Tier D');
  });

  it('GRITS-OBS-004: fallback events emit separate audit events', () => {
    const event: FallbackAuditEvent = {
      executionId: 'exec-004',
      primaryProviderId: 'apple-intelligence-runtime',
      primaryMethodId: 'apple.foundation_models.summarize',
      fallbackProviderId: 'ollama-local',
      fallbackMethodId: 'ollama.summarize',
      reason: 'Primary provider unavailable',
      sameClass: true,
      timestamp: new Date().toISOString(),
    };

    logger.logFallback(event);
    const logs = logger.getFallbackLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].primaryProviderId).toBe('apple-intelligence-runtime');
    expect(logs[0].fallbackProviderId).toBe('ollama-local');
    expect(logs[0].sameClass).toBe(true);
  });

  it('GRITS-OBS-005: sensitive material redacted from logs', () => {
    const event = {
      executionId: 'exec-005',
      sourceType: 'capability' as const,
      sourceId: 'openai-api',
      providerId: 'openai-api',
      methodId: 'openai.gpt.summarize',
      executionMode: 'controlled_remote' as const,
      latencyMs: 200,
      status: 'success' as const,
      apiKey: 'sk-1234567890abcdefghijklmnop',
      timestamp: new Date().toISOString(),
    };

    const redacted = redactLogEvent(event);
    expect(redacted.apiKey).toBe('[REDACTED]');
    // The original event field name is sensitive
    expect(redacted.executionId).toBe('exec-005');
  });

  it('GRITS-OBS-006: validation results attached to execution records', () => {
    const event: ExecutionLogEvent = {
      executionId: 'exec-006',
      sourceType: 'provider',
      sourceId: 'apple-intelligence-runtime',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local',
      latencyMs: 30,
      status: 'success',
      validationResult: 'pass',
      timestamp: new Date().toISOString(),
    };

    logger.logExecution(event);
    const logged = logger.getExecutionLogs()[0];
    expect(logged.validationResult).toBe('pass');
  });
});
