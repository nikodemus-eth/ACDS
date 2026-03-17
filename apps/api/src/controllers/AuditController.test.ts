import { describe, it, expect } from 'vitest';
import { AuditController, type AuditEventReader } from './AuditController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function makeAuditEvent(id: string) {
  return {
    id,
    eventType: 'execution_completed' as any,
    actor: 'system',
    action: 'complete',
    resourceType: 'execution',
    resourceId: 'exec-1',
    application: 'test_app',
    details: { result: 'success' },
    timestamp: new Date('2026-03-15T10:00:00Z'),
  };
}

class InMemoryAuditReader implements AuditEventReader {
  private events = [makeAuditEvent('audit-1'), makeAuditEvent('audit-2')];

  async findById(id: string) {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async find(_filters: any) {
    return this.events;
  }
}

describe('AuditController', () => {
  it('list returns formatted audit events', async () => {
    const controller = new AuditController(new InMemoryAuditReader());
    const reply = createReply();
    await controller.list({ query: {} } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any[]).length).toBe(2);
    expect((reply.body as any[])[0].timestamp).toBe('2026-03-15T10:00:00.000Z');
  });

  it('list passes date filters correctly', async () => {
    let capturedFilters: any;
    const reader: AuditEventReader = {
      findById: async () => null,
      find: async (filters) => { capturedFilters = filters; return []; },
    };

    const controller = new AuditController(reader);
    const reply = createReply();
    await controller.list({
      query: {
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        eventType: 'execution_completed',
        actor: 'admin',
        limit: 10,
        offset: 5,
      },
    } as any, reply as any);

    expect(capturedFilters.dateFrom).toBeInstanceOf(Date);
    expect(capturedFilters.dateTo).toBeInstanceOf(Date);
    expect(capturedFilters.eventType).toBe('execution_completed');
    expect(capturedFilters.actor).toBe('admin');
    expect(capturedFilters.limit).toBe(10);
    expect(capturedFilters.offset).toBe(5);
  });

  it('list passes undefined dates when not provided', async () => {
    let capturedFilters: any;
    const reader: AuditEventReader = {
      findById: async () => null,
      find: async (filters) => { capturedFilters = filters; return []; },
    };

    const controller = new AuditController(reader);
    const reply = createReply();
    await controller.list({ query: {} } as any, reply as any);

    expect(capturedFilters.dateFrom).toBeUndefined();
    expect(capturedFilters.dateTo).toBeUndefined();
  });

  it('getById returns event when found', async () => {
    const controller = new AuditController(new InMemoryAuditReader());
    const reply = createReply();
    await controller.getById({ params: { id: 'audit-1' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).id).toBe('audit-1');
  });

  it('getById returns 404 when not found', async () => {
    const controller = new AuditController(new InMemoryAuditReader());
    const reply = createReply();
    await controller.getById({ params: { id: 'missing' } } as any, reply as any);

    expect(reply.statusCode).toBe(404);
    expect((reply.body as any).message).toContain('missing');
  });
});
