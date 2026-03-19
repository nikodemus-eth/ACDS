import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from './healthRoutes.js';
import { ProviderHealthService } from '@acds/provider-broker';
import type { ProviderHealthRepository } from '@acds/provider-broker';
import type { AppConfig } from '../config/appConfig.js';
import type { FastifyInstance } from 'fastify';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-123';
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
  const repository: ProviderHealthRepository = {
    upsert: async () => {},
    findByProviderId: async () => null,
    findAll: async () => [],
    findByStatus: async () => [],
  };
  app.decorate('diContainer', makeDiContainer({
    providerHealthService: new ProviderHealthService(repository),
  }));
  const config: AppConfig = {
    port: 3000,
    databaseUrl: process.env.DATABASE_URL!,
    masterKeyPath: process.env.MASTER_KEY_PATH!,
    adminSessionSecret: 'test-secret-123',
    logLevel: 'silent',
    version: '0.1.0',
    nodeEnv: 'test',
    startedAt: new Date(),
  };
  app.decorate('config', config);
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
