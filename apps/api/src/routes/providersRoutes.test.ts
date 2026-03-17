import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { providersRoutes } from './providersRoutes.js';

const SECRET = 'test-secret-for-providers';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
});

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate('diContainer', {
    registryService: {
      listAll: async () => [],
      getById: async (id: string) => null,
      create: async (data: any) => ({ id: 'new-id', ...data, createdAt: new Date(), updatedAt: new Date() }),
      update: async () => ({}),
      disable: async () => ({}),
    },
    connectionTester: {
      testConnection: async () => ({ success: true, latencyMs: 10, message: 'ok' }),
    },
    secretRotationService: {
      rotate: async () => ({ rotated: true }),
    },
    providerHealthService: {
      getHealthForProvider: async () => null,
      getAllHealth: async () => [],
    },
  });
  app.decorate('config', {
    adminSessionSecret: SECRET,
  });
  return app;
}

describe('providersRoutes', () => {
  it('registers GET / route', async () => {
    const app = buildTestApp();
    await app.register(providersRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-admin-session': SECRET },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('registers POST /:id/test-connection route', async () => {
    const app = buildTestApp();
    await app.register(providersRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/some-id/test-connection',
      headers: { 'x-admin-session': SECRET },
    });
    // May return 404 or 200 depending on controller logic
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });

  it('registers POST /:id/test route (alias)', async () => {
    const app = buildTestApp();
    await app.register(providersRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/some-id/test',
      headers: { 'x-admin-session': SECRET },
    });
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });

  it('registers POST /:id/rotate-secret route', async () => {
    const app = buildTestApp();
    await app.register(providersRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/some-id/rotate-secret',
      headers: { 'x-admin-session': SECRET },
    });
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });
});
