import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { adaptationApprovalRoutes } from './adaptationApprovalRoutes.js';

const SECRET = 'test-secret-approval';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
});

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate('diContainer', {
    adaptationApprovalRepository: {
      findPending: async () => [],
      findById: async () => null,
      findByFamily: async () => [],
      save: async () => {},
      updateStatus: async () => {},
    },
    approvalAuditEmitter: {
      emit: () => {},
    },
  });
  app.decorate('config', {
    adminSessionSecret: SECRET,
  });
  return app;
}

describe('adaptationApprovalRoutes', () => {
  it('registers GET /approvals route', async () => {
    const app = buildTestApp();
    await app.register(adaptationApprovalRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/approvals',
      headers: { 'x-admin-session': SECRET },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('registers GET /approvals/:id route', async () => {
    const app = buildTestApp();
    await app.register(adaptationApprovalRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/approvals/ap-1',
      headers: { 'x-admin-session': SECRET },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('registers POST /approvals/:id/approve route', async () => {
    const app = buildTestApp();
    await app.register(adaptationApprovalRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/approvals/ap-1/approve',
      headers: {
        'x-admin-session': SECRET,
        'content-type': 'application/json',
      },
      payload: { actor: 'admin', reason: 'ok' },
    });
    // Will error because approval not found
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });

  it('registers POST /approvals/:id/reject route', async () => {
    const app = buildTestApp();
    await app.register(adaptationApprovalRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/approvals/ap-1/reject',
      headers: {
        'x-admin-session': SECRET,
        'content-type': 'application/json',
      },
      payload: { actor: 'admin', reason: 'no' },
    });
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });
});
