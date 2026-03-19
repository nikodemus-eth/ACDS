// ---------------------------------------------------------------------------
// Integration Tests – createDiContainer (DI wiring verification)
// Requires a running PostgreSQL instance on localhost:5432.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createDiContainer } from '../../../apps/api/src/bootstrap/createDiContainer.js';
import type { AppConfig } from '../../../apps/api/src/config/index.js';

const MASTER_KEY_PATH = '/tmp/acds-test-master.key';

const TEST_CONFIG: AppConfig = {
  port: 3100,
  databaseUrl: 'postgresql://acds:pass@localhost:5432/acds_test',
  masterKeyPath: MASTER_KEY_PATH,
  adminSessionSecret: 'test-secret',
  nodeEnv: 'test',
  logLevel: 'silent',
  version: '0.1.0',
  startedAt: new Date('2026-03-16T00:00:00Z'),
};

const REQUIRED_KEYS = [
  'providerHealthService',
  'registryService',
  'profileCatalogService',
  'policyRepository',
  'connectionTester',
  'secretRotationService',
  'dispatchRunService',
  'executionRecordService',
  'auditEventReader',
  'familyPerformanceReader',
  'candidateRankingReader',
  'adaptationEventReader',
  'adaptationRecommendationReader',
  'adaptationApprovalRepository',
  'approvalAuditEmitter',
  'adaptationRollbackService',
  'resolve',
] as const;

describe('createDiContainer', () => {
  beforeAll(async () => {
    await writeFile(MASTER_KEY_PATH, randomBytes(32));
  });

  afterAll(async () => {
    await unlink(MASTER_KEY_PATH).catch(() => {});
  });

  it('creates container with all required service keys', async () => {
    const container = await createDiContainer(TEST_CONFIG);

    for (const key of REQUIRED_KEYS) {
      expect(container, `missing key: ${key}`).toHaveProperty(key);
      expect((container as any)[key], `${key} is undefined`).toBeDefined();
    }
  });

  it('does not contain InMemory or Noop implementations', async () => {
    const container = await createDiContainer(TEST_CONFIG);

    for (const key of REQUIRED_KEYS) {
      if (key === 'resolve') continue;
      const service = (container as any)[key];
      const ctorName = service?.constructor?.name ?? '';
      expect(ctorName, `${key} uses InMemory impl`).not.toMatch(/InMemory/);
      expect(ctorName, `${key} uses Noop impl`).not.toMatch(/Noop/);
    }
  });

  it('resolve() returns the correct service by name', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container).toBeDefined();
    if (!container) {
      throw new Error('DI container was not created');
    }

    const auditReader = container.resolve('auditEventReader');
    expect(auditReader).toBe(container.auditEventReader);

    const registry = container.resolve('registryService');
    expect(registry).toBe(container.registryService);
  });

  it('secretRotationService is defined', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container).toBeDefined();
    if (!container) {
      throw new Error('DI container was not created');
    }
    expect(container.secretRotationService).toBeDefined();
  });

  it('approvalAuditEmitter is defined and not Noop', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container).toBeDefined();
    if (!container) {
      throw new Error('DI container was not created');
    }
    expect(container.approvalAuditEmitter).toBeDefined();
    expect(container.approvalAuditEmitter.constructor.name).not.toBe('NoopApprovalAuditEmitter');
  });

  it('adaptationEventReader is defined', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container).toBeDefined();
    if (!container) {
      throw new Error('DI container was not created');
    }
    expect(container.adaptationEventReader).toBeDefined();
  });

  it('handles URL with sslmode param', async () => {
    const sslConfig: AppConfig = {
      ...TEST_CONFIG,
      databaseUrl: 'postgresql://acds:pass@db.example.com:5432/acds_prod?sslmode=require',
    };

    const container = await createDiContainer(sslConfig);
    expect(container).toBeDefined();

    for (const key of REQUIRED_KEYS) {
      expect(container, `missing key after SSL URL: ${key}`).toHaveProperty(key);
    }
  });

  it('handles URL without port', async () => {
    const noPortConfig: AppConfig = {
      ...TEST_CONFIG,
      databaseUrl: 'postgresql://acds:pass@localhost/acds_test',
    };

    const container = await createDiContainer(noPortConfig);
    expect(container).toBeDefined();

    for (const key of REQUIRED_KEYS) {
      expect(container, `missing key after no-port URL: ${key}`).toHaveProperty(key);
    }
  });
});
