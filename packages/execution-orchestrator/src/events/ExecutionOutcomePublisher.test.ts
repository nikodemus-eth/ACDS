import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionOutcomePublisher } from './ExecutionOutcomePublisher.js';
import type { ExecutionOutcome } from './ExecutionOutcomePublisher.js';

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    executionId: 'exec-1',
    familyKey: 'app:process:step',
    status: 'success',
    latencyMs: 200,
    adapterResponseSummary: { model: 'gpt-4' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('ExecutionOutcomePublisher', () => {
  let publisher: ExecutionOutcomePublisher;

  beforeEach(() => {
    publisher = new ExecutionOutcomePublisher();
  });

  it('starts with zero handlers', () => {
    expect(publisher.handlerCount).toBe(0);
  });

  it('increments handlerCount when handlers are registered', () => {
    publisher.onOutcome(() => {});
    publisher.onOutcome(() => {});
    expect(publisher.handlerCount).toBe(2);
  });

  it('calls a registered handler with the outcome', async () => {
    const received: ExecutionOutcome[] = [];
    publisher.onOutcome((o) => { received.push(o); });

    const outcome = makeOutcome();
    await publisher.publish(outcome);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(outcome);
  });

  it('calls multiple handlers in registration order', async () => {
    const order: number[] = [];
    publisher.onOutcome(() => { order.push(1); });
    publisher.onOutcome(() => { order.push(2); });
    publisher.onOutcome(() => { order.push(3); });

    await publisher.publish(makeOutcome());

    expect(order).toEqual([1, 2, 3]);
  });

  it('does not throw when no handlers are registered', async () => {
    await publisher.publish(makeOutcome());
  });

  it('catches handler errors and continues to next handler', async () => {
    const received: string[] = [];
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      publisher.onOutcome(() => {
        throw new Error('handler-boom');
      });
      publisher.onOutcome((o) => { received.push(o.executionId); });

      await publisher.publish(makeOutcome({ executionId: 'exec-2' }));

      expect(received).toEqual(['exec-2']);
      expect(capturedErrors.length).toBe(1);
      expect((capturedErrors[0] as unknown[])[0]).toContain('[outcome-publisher]');
      expect((capturedErrors[0] as unknown[])[0]).toContain('exec-2');
      expect((capturedErrors[0] as unknown[])[1]).toBe('handler-boom');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('logs non-Error throws from handlers', async () => {
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      publisher.onOutcome(() => {
        throw 'string-error';
      });

      await publisher.publish(makeOutcome());

      expect(capturedErrors.length).toBe(1);
      expect((capturedErrors[0] as unknown[])[1]).toBe('string-error');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('handles async handlers', async () => {
    const received: string[] = [];
    publisher.onOutcome(async (o) => {
      await new Promise((r) => setTimeout(r, 1));
      received.push(o.executionId);
    });

    await publisher.publish(makeOutcome({ executionId: 'async-exec' }));

    expect(received).toEqual(['async-exec']);
  });

  it('catches errors from async handlers', async () => {
    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      publisher.onOutcome(async () => {
        throw new Error('async-boom');
      });
      const received: string[] = [];
      publisher.onOutcome((o) => { received.push(o.executionId); });

      await publisher.publish(makeOutcome({ executionId: 'exec-3' }));

      expect(received).toEqual(['exec-3']);
      expect(capturedErrors.length).toBe(1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('passes different status types through', async () => {
    const statuses: string[] = [];
    publisher.onOutcome((o) => { statuses.push(o.status); });

    await publisher.publish(makeOutcome({ status: 'success' }));
    await publisher.publish(makeOutcome({ status: 'failure' }));
    await publisher.publish(makeOutcome({ status: 'fallback_success' }));
    await publisher.publish(makeOutcome({ status: 'fallback_failure' }));

    expect(statuses).toEqual(['success', 'failure', 'fallback_success', 'fallback_failure']);
  });
});
