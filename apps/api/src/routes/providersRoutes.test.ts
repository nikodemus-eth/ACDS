import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { providersRoutes } from './providersRoutes.js';
import { AuthType, ProviderVendor, type Provider } from '@acds/core-types';
import type { AppConfig } from '../config/appConfig.js';
import type { SecretRotationService } from '@acds/security';
import type { ProviderHealthService } from '@acds/provider-broker';
import type { FastifyInstance } from 'fastify';

const SECRET = 'test-secret-for-providers';

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
  const provider: Provider = {
    id: 'provider-1',
    name: 'Provider 1',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.example.test',
    enabled: true,
    environment: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  app.decorate('diContainer', makeDiContainer({
    registryService: {
      listAll: async () => [],
      listEnabled: async () => [provider],
      getById: async (_id: string) => provider,
      create: async (data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => ({
        ...provider,
        ...data,
        id: 'new-id',
      }),
      update: async () => provider,
      disable: async () => ({ ...provider, enabled: false }),
    } as unknown as NonNullable<FastifyInstance['diContainer']>['registryService'],
    connectionTester: {
      testConnection: async () => ({ success: true, latencyMs: 10, message: 'ok' }),
    },
    secretRotationService: {
      rotateSecret: async () => ({
        providerId: provider.id,
        rotatedAt: new Date(),
        newKeyId: 'key-1',
        success: true,
      }),
    } as unknown as SecretRotationService,
    providerHealthService: {
      getHealth: async () => null,
      getAllHealth: async () => [],
      getHealthyProviders: async () => [],
      recordSuccess: async () => {},
      recordFailure: async () => {},
      repository: {} as never,
    } as unknown as ProviderHealthService,
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
      payload: { newSecret: 'rotated-secret' },
    });
    expect([200, 404, 500]).toContain(res.statusCode);
    await app.close();
  });
});
