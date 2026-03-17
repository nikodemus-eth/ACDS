import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from './app.js';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = 'test-secret-123';
  process.env.NODE_ENV = 'test';
});

function makeDiContainer(overrides: Record<string, unknown> = {}) {
  return {
    providerHealthService: {},
    registryService: {},
    profileCatalogService: {},
    policyRepository: {},
    connectionTester: {},
    secretRotationService: {},
    dispatchRunService: {},
    executionRecordService: {},
    auditEventReader: {},
    familyPerformanceReader: {},
    candidateRankingReader: {},
    adaptationEventReader: {},
    adaptationRecommendationReader: {},
    adaptationApprovalRepository: {},
    approvalAuditEmitter: {},
    adaptationRollbackService: {},
    ...overrides,
  };
}

describe('buildApp', () => {
  it('throws when diContainer is missing required dependencies', async () => {
    await expect(buildApp({ diContainer: {}, logger: false })).rejects.toThrow(
      'ACDS API DI container is incomplete',
    );
  });

  it('throws when diContainer is undefined', async () => {
    await expect(buildApp({ logger: false })).rejects.toThrow(
      'ACDS API DI container is incomplete',
    );
  });

  it('lists missing dependency names in error message', async () => {
    const partial = { providerHealthService: {} };
    await expect(buildApp({ diContainer: partial, logger: false })).rejects.toThrow(
      'registryService',
    );
  });

  it('builds successfully with a complete diContainer', async () => {
    const app = await buildApp({
      diContainer: makeDiContainer(),
      logger: false,
    });
    expect(app).toBeDefined();
    // Fastify instance should have the decorated properties
    expect((app as any).config).toBeDefined();
    expect((app as any).diContainer).toBeDefined();
    await app.close();
  });

  it('builds with explicit logger option', async () => {
    const app = await buildApp({
      diContainer: makeDiContainer(),
      logger: false,
    });
    expect(app).toBeDefined();
    await app.close();
  });
});
