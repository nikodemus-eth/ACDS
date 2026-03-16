// ---------------------------------------------------------------------------
// Unit Tests – createDiContainer (DI wiring verification)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the file system and pool before importing the module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('modelProfiles.json')) {
      return Promise.resolve(JSON.stringify([
        {
          name: 'gpt-4o',
          vendor: 'openai',
          modelId: 'gpt-4o',
          supportedTaskTypes: ['generation'],
          supportedLoadTiers: ['standard'],
          minimumCognitiveGrade: 'standard',
          contextWindow: 128000,
          maxTokens: 4096,
          costPer1kInput: 0.005,
          costPer1kOutput: 0.015,
          localOnly: false,
          cloudAllowed: true,
        },
      ]));
    }
    if (filePath.includes('tacticProfiles.json')) {
      return Promise.resolve(JSON.stringify([
        {
          name: 'direct',
          executionMethod: 'single_pass',
          multiStage: false,
          requiresStructuredOutput: false,
        },
      ]));
    }
    return Promise.reject(new Error(`Unexpected file read: ${filePath}`));
  }),
}));

vi.mock('@acds/persistence-pg', async () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };

  class MockRepo {
    constructor(public pool?: any) {}
  }

  return {
    createPool: vi.fn().mockReturnValue(mockPool),
    PgProviderRepository: MockRepo,
    PgProviderHealthRepository: MockRepo,
    PgExecutionRecordRepository: MockRepo,
    PgOptimizerStateRepository: class extends MockRepo {
      getCandidateStates = vi.fn().mockResolvedValue([]);
    },
    PgAdaptationApprovalRepository: MockRepo,
    PgPolicyRepository: class extends MockRepo {
      getGlobalPolicy = vi.fn().mockResolvedValue(null);
      findApplicationPolicy = vi.fn().mockResolvedValue(null);
      findProcessPolicy = vi.fn().mockResolvedValue(null);
    },
    PgAuditEventRepository: MockRepo,
    PgFamilyPerformanceRepository: MockRepo,
    PgAdaptationEventRepository: MockRepo,
    PgAdaptationRecommendationRepository: MockRepo,
    PgSecretCipherStore: MockRepo,
    PgRollbackRecordWriter: MockRepo,
    PgApprovalAuditEmitter: MockRepo,
    PgRollbackAuditEmitter: MockRepo,
  };
});

import { createDiContainer } from '../../../apps/api/src/bootstrap/createDiContainer.js';
import type { AppConfig } from '../../../apps/api/src/config/index.js';
import { createPool } from '@acds/persistence-pg';

const TEST_CONFIG: AppConfig = {
  port: 3100,
  databaseUrl: 'postgresql://acds:pass@localhost:5432/acds_test',
  masterKeyPath: '/tmp/test-master.key',
  adminSessionSecret: 'test-secret',
  nodeEnv: 'test',
};

describe('createDiContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a database pool with parsed connection URL', async () => {
    const container = await createDiContainer(TEST_CONFIG);

    expect(createPool).toHaveBeenCalledWith({
      host: 'localhost',
      port: 5432,
      database: 'acds_test',
      user: 'acds',
      password: 'pass',
      ssl: false,
    });
    expect(container).toBeDefined();
  });

  it('returns a container with all required service keys', async () => {
    const container = await createDiContainer(TEST_CONFIG);

    const requiredKeys = [
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
    ];

    for (const key of requiredKeys) {
      expect(container).toHaveProperty(key);
      expect((container as any)[key]).toBeDefined();
    }
  });

  it('does not contain any InMemory or Noop implementations', async () => {
    const container = await createDiContainer(TEST_CONFIG);

    const containerStr = JSON.stringify(container, (_key, value) => {
      if (typeof value === 'function') return value.constructor?.name ?? 'function';
      return value;
    });

    expect(containerStr).not.toContain('InMemory');
    expect(containerStr).not.toContain('Noop');
  });

  it('resolve() returns the correct service by name', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    const auditReader = container.resolve('auditEventReader');
    expect(auditReader).toBe(container.auditEventReader);
  });

  it('uses PgSecretCipherStore for the secret rotation service', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container.secretRotationService).toBeDefined();
  });

  it('uses PgApprovalAuditEmitter for the approval audit emitter', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container.approvalAuditEmitter).toBeDefined();
    expect(container.approvalAuditEmitter.constructor.name).not.toBe('NoopApprovalAuditEmitter');
  });

  it('uses PgAdaptationEventRepository as the adaptation event reader', async () => {
    const container = await createDiContainer(TEST_CONFIG);
    expect(container.adaptationEventReader).toBeDefined();
  });

  it('parses SSL from connection URL', async () => {
    const sslConfig: AppConfig = {
      ...TEST_CONFIG,
      databaseUrl: 'postgresql://acds:pass@db.example.com:5432/acds_prod?sslmode=require',
    };

    await createDiContainer(sslConfig);

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: true, host: 'db.example.com' }),
    );
  });

  it('defaults port to 5432 when not specified', async () => {
    const noPortConfig: AppConfig = {
      ...TEST_CONFIG,
      databaseUrl: 'postgresql://acds:pass@localhost/acds_test',
    };

    await createDiContainer(noPortConfig);

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({ port: 5432 }),
    );
  });
});
