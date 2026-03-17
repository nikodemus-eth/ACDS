import { describe, it, expect } from 'vitest';
import { buildExecutionEvent } from './buildExecutionEvent.js';
import { AuditEventType } from '@acds/core-types';

describe('buildExecutionEvent', () => {
  it('returns an AuditEvent with EXECUTION type and correct fields', () => {
    const event = buildExecutionEvent('execution.started', 'exec-1', 'my-app', { foo: 'bar' });

    expect(event.eventType).toBe(AuditEventType.EXECUTION);
    expect(event.actor).toBe('system');
    expect(event.action).toBe('execution.started');
    expect(event.resourceType).toBe('execution_record');
    expect(event.resourceId).toBe('exec-1');
    expect(event.application).toBe('my-app');
    expect(event.details).toEqual({ foo: 'bar' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
  });

  it('defaults details to an empty object when omitted', () => {
    const event = buildExecutionEvent('execution.completed', 'exec-2', 'app-2');

    expect(event.details).toEqual({});
  });

  it('generates a unique id for each call', () => {
    const a = buildExecutionEvent('a', 'id-a', 'app');
    const b = buildExecutionEvent('b', 'id-b', 'app');

    expect(a.id).not.toBe(b.id);
  });
});
