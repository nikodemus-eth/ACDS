import { describe, it, expect } from 'vitest';
import { buildProviderEvent } from './buildProviderEvent.js';
import { AuditEventType } from '@acds/core-types';

describe('buildProviderEvent', () => {
  it('returns an AuditEvent with PROVIDER type and correct fields', () => {
    const event = buildProviderEvent('provider.created', 'prov-1', 'admin-user', { model: 'gpt-4' });

    expect(event.eventType).toBe(AuditEventType.PROVIDER);
    expect(event.actor).toBe('admin-user');
    expect(event.action).toBe('provider.created');
    expect(event.resourceType).toBe('provider');
    expect(event.resourceId).toBe('prov-1');
    expect(event.application).toBeNull();
    expect(event.details).toEqual({ model: 'gpt-4' });
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.id).toBe('string');
  });

  it('defaults details to an empty object when omitted', () => {
    const event = buildProviderEvent('provider.disabled', 'prov-2', 'ops');

    expect(event.details).toEqual({});
  });

  it('generates a unique id for each call', () => {
    const a = buildProviderEvent('a', 'id-a', 'actor');
    const b = buildProviderEvent('b', 'id-b', 'actor');

    expect(a.id).not.toBe(b.id);
  });
});
