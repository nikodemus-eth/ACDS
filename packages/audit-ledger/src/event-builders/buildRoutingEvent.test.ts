import { describe, it, expect } from 'vitest';
import { buildRoutingEvent } from './buildRoutingEvent.js';
import { AuditEventType } from '@acds/core-types';

describe('buildRoutingEvent', () => {
  it('returns an AuditEvent with ROUTING type and correct fields', () => {
    const event = buildRoutingEvent('routing.resolved', 'rd-1', 'my-app', { provider: 'openai' });

    expect(event.eventType).toBe(AuditEventType.ROUTING);
    expect(event.actor).toBe('system');
    expect(event.action).toBe('routing.resolved');
    expect(event.resourceType).toBe('routing_decision');
    expect(event.resourceId).toBe('rd-1');
    expect(event.application).toBe('my-app');
    expect(event.details).toEqual({ provider: 'openai' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
  });

  it('defaults details to an empty object when omitted', () => {
    const event = buildRoutingEvent('routing.fallback', 'rd-2', 'app-2');

    expect(event.details).toEqual({});
  });

  it('generates a unique id for each call', () => {
    const a = buildRoutingEvent('a', 'id-a', 'app');
    const b = buildRoutingEvent('b', 'id-b', 'app');

    expect(a.id).not.toBe(b.id);
  });
});
