import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AuditController, type AuditEventReader } from './AuditController.js';
import { PgAuditEventRepository } from '@acds/persistence-pg';
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// -- Helpers -----------------------------------------------------------------

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function createReader(): PgAuditEventRepository {
  return new PgAuditEventRepository(pool as any);
}

const AUDIT_ID_1 = '00000000-0000-0000-0000-000000000001';
const AUDIT_ID_2 = '00000000-0000-0000-0000-000000000002';
const AUDIT_ID_MISSING = '00000000-0000-0000-0000-00000000ffff';

async function seedAuditEvent(id: string) {
  await pool.query(
    `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, application, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, 'execution_completed', 'system', 'complete', 'execution', 'exec-1', 'test_app', JSON.stringify({ result: 'success' }), new Date('2026-03-15T10:00:00Z')],
  );
}

// -- Tests -------------------------------------------------------------------

describe('AuditController', () => {
  it('list returns formatted audit events', async () => {
    await seedAuditEvent(AUDIT_ID_1);
    await seedAuditEvent(AUDIT_ID_2);
    const controller = new AuditController(createReader());
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
    await seedAuditEvent(AUDIT_ID_1);
    const controller = new AuditController(createReader());
    const reply = createReply();
    await controller.getById({ params: { id: AUDIT_ID_1 } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).id).toBe(AUDIT_ID_1);
  });

  it('getById returns 404 when not found', async () => {
    const controller = new AuditController(createReader());
    const reply = createReply();
    await controller.getById({ params: { id: AUDIT_ID_MISSING } } as any, reply as any);

    expect(reply.statusCode).toBe(404);
    expect((reply.body as any).message).toContain(AUDIT_ID_MISSING);
  });
});
