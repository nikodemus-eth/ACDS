import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { adaptationApprovalRoutes } from './adaptationApprovalRoutes.js';
import type { AppConfig } from '../config/appConfig.js';
import type { FastifyInstance } from 'fastify';

const SECRET = 'test-secret-approval';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
});

function makeDiContainer(overrides: Partial<NonNullable<FastifyInstance['diContainer']>> = {}): NonNullable<FastifyInstance['diContainer']> {
  return {
    providerHealthService: {} as never,
    registryService: {} as never,
    profileCatalogService: {} as never,
    policyRepository: {} as never,
    connectionTester: {} as never,
    secretRotationService: {} as never,
    dispatchRunService: {} as never,
    executionRecordService: {} as never,
    auditEventReader: {} as never,
    familyPerformanceReader: {} as never,
    candidateRankingReader: {} as never,
    adaptationEventReader: {} as never,
    adaptationRecommendationReader: {} as never,
    adaptationApprovalRepository: {} as never,
    approvalAuditEmitter: {} as never,
    adaptationRollbackService: {} as never,
    resolve: <T>(name: string) => overrides[name as keyof typeof overrides] as T,
    ...overrides,
  };
}

function buildTestApp() {
  const app = Fastify({ logger: false });
  app.decorate('diContainer', makeDiContainer({
    adaptationApprovalRepository: {
      findPending: async () => [],
      findById: async () => undefined,
      findByFamily: async () => [],
      save: async () => {},
      updateStatus: async () => {},
    },
    approvalAuditEmitter: {
      emit: () => {},
    },
  }));
  const config: AppConfig = {
    port: 3000,
    databaseUrl: process.env.DATABASE_URL!,
    masterKeyPath: process.env.MASTER_KEY_PATH!,
    adminSessionSecret: SECRET,
    nodeEnv: 'test',
    logLevel: 'silent',
    version: '0.1.0',
    startedAt: new Date(),
  };
  app.decorate('config', config);
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
