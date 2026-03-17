import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from './healthRoutes.js';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-123';
  process.env.NODE_ENV = 'test';
});

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate('diContainer', {
    providerHealthService: {
      getAllHealth: async () => [],
    },
  });
  app.decorate('config', {
    version: '0.1.0',
    nodeEnv: 'test',
    startedAt: new Date(),
    adminSessionSecret: 'test-secret-123',
  });
  return app;
}

describe('healthRoutes', () => {
  it('registers GET /health route', async () => {
    const app = buildTestApp();
    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('registers GET /health/providers route', async () => {
    const app = buildTestApp();
    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health/providers' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
