import { describe, it, expect } from 'vitest';
import { ExecutionLogger } from './execution-logger.js';

describe('ExecutionLogger', () => {
  it('logs and retrieves execution events', () => {
    const logger = new ExecutionLogger();
    logger.logExecution({ executionId: 'e1', methodId: 'test', status: 'success' } as any);
    expect(logger.getExecutionLogs()).toHaveLength(1);
    expect(logger.getExecutionLogs()[0].executionId).toBe('e1');
  });

  it('logs and retrieves policy events', () => {
    const logger = new ExecutionLogger();
    logger.logPolicyDecision({ executionId: 'e1', decision: 'allowed' } as any);
    expect(logger.getPolicyLogs()).toHaveLength(1);
  });

  it('logs and retrieves fallback events', () => {
    const logger = new ExecutionLogger();
    logger.logFallback({ executionId: 'e1', reason: 'timeout' } as any);
    expect(logger.getFallbackLogs()).toHaveLength(1);
  });

  it('clear removes all logs', () => {
    const logger = new ExecutionLogger();
    logger.logExecution({ executionId: 'e1' } as any);
    logger.logPolicyDecision({ executionId: 'e1' } as any);
    logger.logFallback({ executionId: 'e1' } as any);
    logger.clear();
    expect(logger.getExecutionLogs()).toHaveLength(0);
    expect(logger.getPolicyLogs()).toHaveLength(0);
    expect(logger.getFallbackLogs()).toHaveLength(0);
  });

  it('redacts sensitive fields in logged events', () => {
    const logger = new ExecutionLogger();
    logger.logExecution({ executionId: 'e1', apiKey: 'secret-key' } as any);
    expect(logger.getExecutionLogs()[0].apiKey).toBe('[REDACTED]');
  });

  it('returns copies of log arrays', () => {
    const logger = new ExecutionLogger();
    logger.logExecution({ executionId: 'e1' } as any);
    const logs = logger.getExecutionLogs();
    expect(logs).toHaveLength(1);
    // Modifying returned array should not affect internal state
    (logs as any[]).push({ executionId: 'e2' });
    expect(logger.getExecutionLogs()).toHaveLength(1);
  });
});
