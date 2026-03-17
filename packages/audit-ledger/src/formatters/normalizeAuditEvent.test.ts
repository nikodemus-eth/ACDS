import { describe, it, expect } from 'vitest';
import { normalizeAuditEvent } from './normalizeAuditEvent.js';
import type { AuditEvent } from '../writers/AuditEventWriter.js';
import { AuditEventType } from '@acds/core-types';

describe('normalizeAuditEvent', () => {
  const baseEvent: AuditEvent = {
    id: 'evt-123',
    eventType: AuditEventType.EXECUTION,
    actor: 'system',
    action: 'execution.started',
    resourceType: 'execution_record',
    resourceId: 'exec-1',
    application: 'my-app',
    details: { duration: 42 },
    timestamp: new Date('2025-06-15T10:30:00.000Z'),
  };

  it('converts timestamp from Date to ISO string', () => {
    const normalized = normalizeAuditEvent(baseEvent);

    expect(normalized.timestamp).toBe('2025-06-15T10:30:00.000Z');
  });

  it('preserves all other fields unchanged', () => {
    const normalized = normalizeAuditEvent(baseEvent);

    expect(normalized.id).toBe('evt-123');
    expect(normalized.eventType).toBe(AuditEventType.EXECUTION);
    expect(normalized.actor).toBe('system');
    expect(normalized.action).toBe('execution.started');
    expect(normalized.resourceType).toBe('execution_record');
    expect(normalized.resourceId).toBe('exec-1');
    expect(normalized.application).toBe('my-app');
    expect(normalized.details).toEqual({ duration: 42 });
  });

  it('handles null application', () => {
    const event: AuditEvent = { ...baseEvent, application: null };
    const normalized = normalizeAuditEvent(event);

    expect(normalized.application).toBeNull();
  });

  it('handles empty details', () => {
    const event: AuditEvent = { ...baseEvent, details: {} };
    const normalized = normalizeAuditEvent(event);

    expect(normalized.details).toEqual({});
  });
});
