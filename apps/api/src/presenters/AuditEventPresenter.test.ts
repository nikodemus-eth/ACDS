import { describe, it, expect } from 'vitest';
import { AuditEventPresenter } from './AuditEventPresenter.js';

const now = new Date('2026-03-15T10:00:00Z');

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    eventType: 'execution',
    actor: 'system',
    action: 'execution_completed',
    resourceType: 'execution',
    resourceId: 'exec-1',
    application: 'myapp',
    details: { status: 'succeeded', latencyMs: 500 },
    timestamp: now,
    ...overrides,
  } as any;
}

describe('AuditEventPresenter', () => {
  describe('toView', () => {
    it('formats an audit event correctly', () => {
      const view = AuditEventPresenter.toView(makeEvent());
      expect(view.id).toBe('audit-1');
      expect(view.eventType).toBe('execution');
      expect(view.actor).toBe('system');
      expect(view.action).toBe('execution_completed');
      expect(view.resourceType).toBe('execution');
      expect(view.resourceId).toBe('exec-1');
      expect(view.application).toBe('myapp');
      expect(view.timestamp).toBe('2026-03-15T10:00:00.000Z');
    });

    it('passes through safe details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { status: 'ok', count: 42 },
      }));
      expect(view.details).toEqual({ status: 'ok', count: 42 });
    });

    it('redacts apiKey from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { apiKey: 'sk-secret123', status: 'ok' },
      }));
      expect(view.details.apiKey).toBe('[REDACTED]');
      expect(view.details.status).toBe('ok');
    });

    it('redacts apiSecret from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { apiSecret: 'mysecret' },
      }));
      expect(view.details.apiSecret).toBe('[REDACTED]');
    });

    it('redacts secret from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { secret: 'hidden' },
      }));
      expect(view.details.secret).toBe('[REDACTED]');
    });

    it('redacts secretKey from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { secretKey: 'hidden' },
      }));
      expect(view.details.secretKey).toBe('[REDACTED]');
    });

    it('redacts password from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { password: 'pass123' },
      }));
      expect(view.details.password).toBe('[REDACTED]');
    });

    it('redacts token from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { token: 'tok_abc' },
      }));
      expect(view.details.token).toBe('[REDACTED]');
    });

    it('redacts accessToken from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { accessToken: 'at_123' },
      }));
      expect(view.details.accessToken).toBe('[REDACTED]');
    });

    it('redacts refreshToken from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { refreshToken: 'rt_abc' },
      }));
      expect(view.details.refreshToken).toBe('[REDACTED]');
    });

    it('redacts credentials from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { credentials: { user: 'admin', pass: 'secret' } },
      }));
      expect(view.details.credentials).toBe('[REDACTED]');
    });

    it('redacts connectionString from details', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { connectionString: 'postgres://user:pass@host/db' },
      }));
      expect(view.details.connectionString).toBe('[REDACTED]');
    });

    it('redacts multiple secret keys at once', () => {
      const view = AuditEventPresenter.toView(makeEvent({
        details: { apiKey: 'key', password: 'pass', status: 'ok' },
      }));
      expect(view.details.apiKey).toBe('[REDACTED]');
      expect(view.details.password).toBe('[REDACTED]');
      expect(view.details.status).toBe('ok');
    });

    it('handles null application', () => {
      const view = AuditEventPresenter.toView(makeEvent({ application: null }));
      expect(view.application).toBeNull();
    });

    it('handles empty details object', () => {
      const view = AuditEventPresenter.toView(makeEvent({ details: {} }));
      expect(view.details).toEqual({});
    });
  });

  describe('toViewList', () => {
    it('formats multiple events', () => {
      const events = [makeEvent({ id: 'a1' }), makeEvent({ id: 'a2' })];
      const views = AuditEventPresenter.toViewList(events);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('a1');
      expect(views[1].id).toBe('a2');
    });

    it('returns empty array for empty input', () => {
      expect(AuditEventPresenter.toViewList([])).toEqual([]);
    });
  });
});
