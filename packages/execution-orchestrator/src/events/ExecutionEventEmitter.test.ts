import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionEventEmitter } from './ExecutionEventEmitter.js';
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

describe('ExecutionEventEmitter', () => {
  let emitter: ExecutionEventEmitter;

  beforeEach(() => {
    emitter = new ExecutionEventEmitter();
  });

  it('calls a registered handler when an event is emitted', () => {
    const received: ExecutionEvent[] = [];
    emitter.on((event) => received.push(event));

    const event = makeEvent();
    emitter.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('calls multiple handlers in registration order', () => {
    const order: number[] = [];
    emitter.on(() => order.push(1));
    emitter.on(() => order.push(2));
    emitter.on(() => order.push(3));

    emitter.emit(makeEvent());

    expect(order).toEqual([1, 2, 3]);
  });

  it('does not call handlers when no handlers are registered', () => {
    // Should not throw
    emitter.emit(makeEvent());
  });

  it('catches handler errors and continues to next handler', () => {
    const received: string[] = [];
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      emitter.on(() => {
        throw new Error('handler-boom');
      });
      emitter.on((event) => received.push(event.executionId));

      emitter.emit(makeEvent({ executionId: 'exec-2' }));

      // Second handler should still fire
      expect(received).toEqual(['exec-2']);
      // Error should have been logged
      expect(capturedErrors.length).toBe(1);
      expect((capturedErrors[0] as unknown[])[0]).toContain('[event-emitter]');
      expect((capturedErrors[0] as unknown[])[0]).toContain('execution.created');
      expect((capturedErrors[0] as unknown[])[1]).toBe('handler-boom');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('logs non-Error throws from handlers', () => {
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      emitter.on(() => {
        throw 'string-error';
      });

      emitter.emit(makeEvent());

      expect(capturedErrors.length).toBe(1);
      expect((capturedErrors[0] as unknown[])[1]).toBe('string-error');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('passes different event types to handlers', () => {
    const types: string[] = [];
    emitter.on((event) => types.push(event.type));

    emitter.emit(makeEvent({ type: 'execution.running' }));
    emitter.emit(makeEvent({ type: 'execution.succeeded' }));
    emitter.emit(makeEvent({ type: 'execution.failed' }));

    expect(types).toEqual(['execution.running', 'execution.succeeded', 'execution.failed']);
  });

  it('passes event details to handlers', () => {
    const captured: Record<string, unknown>[] = [];
    emitter.on((event) => captured.push(event.details));

    emitter.emit(makeEvent({ details: { model: 'gpt-4', latencyMs: 100 } }));

    expect(captured[0]).toEqual({ model: 'gpt-4', latencyMs: 100 });
  });

  it('handles error in first handler and no other handlers', () => {
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      emitter.on(() => {
        throw new Error('only handler fails');
      });

      emitter.emit(makeEvent());

      expect(capturedErrors.length).toBe(1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
