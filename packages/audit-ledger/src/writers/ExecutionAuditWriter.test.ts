import { describe, it, expect } from 'vitest';
import { ExecutionAuditWriter } from './ExecutionAuditWriter.js';
import type { AuditEventWriter, AuditEvent } from './AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';

class InMemoryAuditWriter implements AuditEventWriter {
  readonly events: AuditEvent[] = [];

  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async writeBatch(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

describe('ExecutionAuditWriter', () => {
  it('writeExecutionStarted writes an event with action execution.started', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionStarted('exec-1', 'my-app', { input: 'hello' });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('execution.started');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.actor).toBe('system');
    expect(event.resourceType).toBe('execution_record');
    expect(event.resourceId).toBe('exec-1');
    expect(event.application).toBe('my-app');
    expect(event.details).toEqual({ input: 'hello' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
  });

  it('writeExecutionCompleted writes an event with action execution.completed', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionCompleted('exec-2', 'app-2', { tokens: 100 });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('execution.completed');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.resourceId).toBe('exec-2');
    expect(event.application).toBe('app-2');
    expect(event.details).toEqual({ tokens: 100 });
  });

  it('writeExecutionFailed writes an event with action execution.failed', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionFailed('exec-3', 'app-3', { error: 'timeout' });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.action).toBe('execution.failed');
    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.resourceId).toBe('exec-3');
    expect(event.details).toEqual({ error: 'timeout' });
  });

  it('each write generates a unique event id', async () => {
    const store = new InMemoryAuditWriter();
    const writer = new ExecutionAuditWriter(store);

    await writer.writeExecutionStarted('e1', 'app', {});
    await writer.writeExecutionCompleted('e1', 'app', {});

    expect(store.events[0].id).not.toBe(store.events[1].id);
  });
});
