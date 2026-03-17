import { describe, it, expect } from 'vitest';
import { ExecutionLifecycleLogger } from './ExecutionLifecycleLogger.js';
import type { ExecutionEvent } from './ExecutionEventEmitter.js';

function makeEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    type: 'execution.created',
    executionId: 'exec-1',
    timestamp: new Date('2026-03-15T10:00:00Z'),
    details: {},
    ...overrides,
  };
}

describe('ExecutionLifecycleLogger', () => {
  it('logs an event with no details', () => {
    const logger = new ExecutionLifecycleLogger();
    const originalLog = console.log;
    const captured: unknown[] = [];
    console.log = (...args: unknown[]) => captured.push(args);

    try {
      logger.log(makeEvent());

      expect(captured).toHaveLength(1);
      const msg = (captured[0] as unknown[])[0] as string;
      expect(msg).toContain('[execution-lifecycle]');
      expect(msg).toContain('execution.created');
      expect(msg).toContain('execution=exec-1');
      expect(msg).toContain('time=2026-03-15T10:00:00.000Z');
      // Should NOT contain details separator when details is empty
      expect(msg).not.toContain(' | {');
    } finally {
      console.log = originalLog;
    }
  });

  it('logs an event with details', () => {
    const logger = new ExecutionLifecycleLogger();
    const originalLog = console.log;
    const captured: unknown[] = [];
    console.log = (...args: unknown[]) => captured.push(args);

    try {
      logger.log(makeEvent({
        type: 'execution.succeeded',
        executionId: 'exec-42',
        details: { model: 'gpt-4', latencyMs: 123 },
      }));

      const msg = (captured[0] as unknown[])[0] as string;
      expect(msg).toContain('execution.succeeded');
      expect(msg).toContain('execution=exec-42');
      expect(msg).toContain('"model":"gpt-4"');
      expect(msg).toContain('"latencyMs":123');
    } finally {
      console.log = originalLog;
    }
  });

  it('logs different event types', () => {
    const logger = new ExecutionLifecycleLogger();
    const originalLog = console.log;
    const captured: unknown[] = [];
    console.log = (...args: unknown[]) => captured.push(args);

    try {
      logger.log(makeEvent({ type: 'execution.failed' }));
      logger.log(makeEvent({ type: 'execution.fallback_started' }));

      expect(captured).toHaveLength(2);
      expect((captured[0] as unknown[])[0]).toContain('execution.failed');
      expect((captured[1] as unknown[])[0]).toContain('execution.fallback_started');
    } finally {
      console.log = originalLog;
    }
  });

  it('includes ISO timestamp from event', () => {
    const logger = new ExecutionLifecycleLogger();
    const originalLog = console.log;
    const captured: unknown[] = [];
    console.log = (...args: unknown[]) => captured.push(args);

    try {
      const ts = new Date('2026-06-01T15:30:00Z');
      logger.log(makeEvent({ timestamp: ts }));

      const msg = (captured[0] as unknown[])[0] as string;
      expect(msg).toContain('time=2026-06-01T15:30:00.000Z');
    } finally {
      console.log = originalLog;
    }
  });
});
