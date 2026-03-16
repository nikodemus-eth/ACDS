import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthType, CognitiveGrade, DecisionPosture, LoadTier, ProviderVendor, TaskType } from '@acds/core-types';
import type { ExecutionRecord, ModelProfile, Provider, ProviderHealth, TacticProfile } from '@acds/core-types';
import { buildApp } from '../../apps/api/src/app.js';
import { ProfileCatalogService } from '../../apps/api/src/services/ProfileCatalogService.js';

const ADMIN_SECRET = 'test-admin-secret';

beforeAll(() => {
  process.env['NODE_ENV'] = 'test';
  process.env['ADMIN_SESSION_SECRET'] = ADMIN_SECRET;
  process.env['DATABASE_URL'] = 'postgres://acds:test@localhost:5432/acds_test';
  process.env['MASTER_KEY_PATH'] = '/tmp/acds-test-master.key';
  process.env['PORT'] = '3100';
});

afterEach(async (context) => {
  void context;
  if (_app) await _app.close();
  _app = null;
});

let _app: Awaited<ReturnType<typeof buildApp>> | null = null;

interface InjectRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
}

interface InjectResponse {
  statusCode: number;
  json(): any;
}

function makeProvider(id = 'prov-openai'): Provider {
  return {
    id,
    name: 'OpenAI Production',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'production',
    createdAt: new Date('2026-03-15T18:00:00.000Z'),
    updatedAt: new Date('2026-03-15T18:30:00.000Z'),
  };
}

function makeProviderHealth(providerId: string): ProviderHealth {
  return {
    providerId,
    status: 'healthy',
    lastTestAt: new Date('2026-03-15T18:31:00.000Z'),
    lastSuccessAt: new Date('2026-03-15T18:31:00.000Z'),
    lastFailureAt: null,
    latencyMs: 182,
    message: 'Connection verified successfully.',
  };
}

function makeExecutionRecord(id: string, status: ExecutionRecord['status'], application: string): ExecutionRecord {
  return {
    id,
    executionFamily: {
      application,
      process: 'content_review',
      step: 'initial_draft',
      decisionPosture: DecisionPosture.ADVISORY,
      cognitiveGrade: CognitiveGrade.STANDARD,
    },
    routingDecisionId: `route-${id}`,
    selectedModelProfileId: 'cloud_frontier_reasoning',
    selectedTacticProfileId: 'single_pass_fast',
    selectedProviderId: 'prov-openai',
    status,
    inputTokens: 100,
    outputTokens: 40,
    latencyMs: 850,
    costEstimate: 0.014,
    normalizedOutput: 'Draft completed successfully.',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date('2026-03-15T18:45:00.000Z'),
    completedAt: new Date('2026-03-15T18:46:00.000Z'),
  };
}

function makePolicyRepository() {
  const globalPolicy = {
    id: 'global-policy',
    allowedVendors: [ProviderVendor.OPENAI, ProviderVendor.OLLAMA],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed' as const,
    defaultCostSensitivity: 'medium' as const,
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: { [LoadTier.BATCH]: 5000 },
    localPreferredTaskTypes: [TaskType.GENERATION],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date('2026-03-15T18:00:00.000Z'),
  };

  const applicationPolicies = [
    {
      id: 'app-policy',
      application: 'process_swarm',
      allowedVendors: [ProviderVendor.OPENAI],
      blockedVendors: null,
      privacyOverride: null,
      costSensitivityOverride: null,
      preferredModelProfileIds: ['cloud_frontier_reasoning'],
      blockedModelProfileIds: null,
      localPreferredTaskTypes: null,
      structuredOutputRequiredForGrades: null,
      enabled: true,
      updatedAt: new Date('2026-03-15T18:10:00.000Z'),
    },
  ];

  const processPolicies = [
    {
      id: 'process-policy',
      application: 'process_swarm',
      process: 'content_review',
      step: null,
      defaultModelProfileId: 'cloud_frontier_reasoning',
      defaultTacticProfileId: 'single_pass_fast',
      allowedModelProfileIds: ['cloud_frontier_reasoning'],
      blockedModelProfileIds: null,
      allowedTacticProfileIds: ['single_pass_fast'],
      privacyOverride: null,
      costSensitivityOverride: null,
      forceEscalationForGrades: null,
      enabled: true,
      updatedAt: new Date('2026-03-15T18:20:00.000Z'),
    },
  ];

  return {
    getGlobalPolicy: async () => globalPolicy,
    saveGlobalPolicy: async (policy: typeof globalPolicy) => Object.assign(globalPolicy, policy),
    listApplicationPolicies: async () => [...applicationPolicies],
    findApplicationPolicyById: async (id: string) =>
      applicationPolicies.find((policy) => policy.id === id) ?? null,
    saveApplicationPolicy: async (policy: (typeof applicationPolicies)[number]) => {
      const index = applicationPolicies.findIndex((entry) => entry.id === policy.id);
      if (index >= 0) {
        applicationPolicies[index] = policy;
      } else {
        applicationPolicies.push(policy);
      }
    },
    deleteApplicationPolicy: async (id: string) => {
      const index = applicationPolicies.findIndex((policy) => policy.id === id);
      if (index >= 0) applicationPolicies.splice(index, 1);
    },
    listProcessPolicies: async () => [...processPolicies],
    findProcessPolicyById: async (id: string) =>
      processPolicies.find((policy) => policy.id === id) ?? null,
    saveProcessPolicy: async (policy: (typeof processPolicies)[number]) => {
      const index = processPolicies.findIndex((entry) => entry.id === policy.id);
      if (index >= 0) {
        processPolicies[index] = policy;
      } else {
        processPolicies.push(policy);
      }
    },
    deleteProcessPolicy: async (id: string) => {
      const index = processPolicies.findIndex((policy) => policy.id === id);
      if (index >= 0) processPolicies.splice(index, 1);
    },
  };
}

async function makeApp() {
  const provider = makeProvider();
  const providerHealth = makeProviderHealth(provider.id);
  const providers = [provider];

  const modelProfiles: ModelProfile[] = [
    {
      id: 'cloud_frontier_reasoning',
      name: 'cloud_frontier_reasoning',
      description: 'High-capability cloud reasoning profile',
      vendor: ProviderVendor.OPENAI,
      modelId: 'gpt-4.1',
      supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.REASONING],
      supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
      minimumCognitiveGrade: CognitiveGrade.ENHANCED,
      contextWindow: 128000,
      maxTokens: 8192,
      costPer1kInput: 0.01,
      costPer1kOutput: 0.03,
      localOnly: false,
      cloudAllowed: true,
      enabled: true,
      createdAt: new Date('2026-03-15T17:00:00.000Z'),
      updatedAt: new Date('2026-03-15T17:30:00.000Z'),
    },
  ];

  const tacticProfiles: TacticProfile[] = [
    {
      id: 'single_pass_fast',
      name: 'single_pass_fast',
      description: 'Fast single-pass execution',
      executionMethod: 'single_pass',
      systemPromptTemplate: '',
      outputSchema: undefined,
      maxRetries: 0,
      temperature: 0,
      topP: 1,
      supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.GENERATION],
      supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
      multiStage: false,
      requiresStructuredOutput: false,
      enabled: true,
      createdAt: new Date('2026-03-15T17:10:00.000Z'),
      updatedAt: new Date('2026-03-15T17:20:00.000Z'),
    },
  ];

  const profileCatalogService = new ProfileCatalogService(modelProfiles, tacticProfiles);
  const executionRecords = [
    makeExecutionRecord('exec-1', 'succeeded', 'process_swarm'),
    makeExecutionRecord('exec-2', 'failed', 'thingstead'),
  ];

  const app = await buildApp({
    logger: false,
    diContainer: {
      providerHealthService: {
        getHealth: async () => providerHealth,
      },
      registryService: {
        create: async (input: Partial<Provider>) => {
          const created = { ...provider, ...input, id: 'prov-created', createdAt: new Date(), updatedAt: new Date() };
          providers.push(created as Provider);
          return created;
        },
        listAll: async () => providers,
        getById: async (id: string) => providers.find((entry) => entry.id === id) ?? null,
        update: async (id: string, input: Partial<Provider>) => {
          const current = providers.find((entry) => entry.id === id)!;
          Object.assign(current, input, { updatedAt: new Date() });
          return current;
        },
        disable: async (id: string) => {
          const current = providers.find((entry) => entry.id === id)!;
          current.enabled = false;
          current.updatedAt = new Date();
          return current;
        },
      },
      profileCatalogService,
      policyRepository: makePolicyRepository(),
      connectionTester: {
        testConnection: async () => providerHealth,
      },
      secretRotationService: {
        rotateSecret: async (providerId: string) => ({
          providerId,
          rotatedAt: new Date('2026-03-15T19:00:00.000Z'),
          newKeyId: 'key-2',
        }),
      },
      dispatchRunService: {
        resolveRoute: async () => ({ decision: null, rationale: null }),
        run: async () => ({ executionId: 'exec-1', status: 'succeeded' }),
      },
      executionRecordService: {
        getRecent: async () => executionRecords,
        getByFamily: async (family: string) =>
          executionRecords.filter((record) => `${record.executionFamily.application}.${record.executionFamily.process}.${record.executionFamily.step}` === family),
        getFiltered: async (filters: { status?: string; application?: string }) =>
          executionRecords.filter((record) =>
            (!filters.status || record.status === filters.status) &&
            (!filters.application || record.executionFamily.application === filters.application),
          ),
        getById: async (id: string) => executionRecords.find((record) => record.id === id) ?? null,
      },
      auditEventReader: {
        list: async () => [],
        getById: async () => null,
      },
      familyPerformanceReader: {
        listFamilies: async () => [],
        getFamilyDetail: async () => null,
      },
      candidateRankingReader: {
        getRankingsByFamily: async () => [],
      },
      adaptationEventReader: {
        listEvents: async () => [],
      },
      adaptationRecommendationReader: {
        listPending: async () => [],
      },
      adaptationApprovalRepository: {
        list: async () => [],
        getById: async () => null,
        approve: async () => null,
        reject: async () => null,
      },
      approvalAuditEmitter: {
        emit: async () => undefined,
      },
      adaptationRollbackService: {
        previewRollback: async () => ({ safe: true, warnings: [], currentSnapshot: null, restoredSnapshot: null }),
        executeRollback: async () => ({ id: 'rollback-1' }),
      },
    },
  });

  return app;
}

async function injectRequest(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: InjectRequestOptions,
): Promise<InjectResponse> {
  return app.inject(options as any) as any;
}

async function injectAuthorized(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: InjectRequestOptions,
) : Promise<InjectResponse> {
  return injectRequest(app, {
    ...options,
    headers: {
      'x-admin-session': ADMIN_SECRET,
      ...(options.headers ?? {}),
    },
  });
}

describe('Admin API routes', () => {
  it('rejects unauthenticated admin route access', async () => {
    const app = await makeApp();
    _app = app;

    const response = await injectRequest(app, { method: 'GET', url: '/profiles/model' });

    expect(response.statusCode).toBe(401);
  });

  it('serves model profiles through the real /profiles route with auth', async () => {
    const app = await makeApp();
    _app = app;

    const response = await injectAuthorized(app, { method: 'GET', url: '/profiles/model' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cloud_frontier_reasoning',
          modelId: 'gpt-4.1',
        }),
      ]),
    );
  });

  it('creates and lists application policies through /policies', async () => {
    const app = await makeApp();
    _app = app;

    const createResponse = await injectAuthorized(app, {
      method: 'POST',
      url: '/policies',
      payload: {
        level: 'application',
        application: 'thingstead',
        allowedVendors: ['openai'],
        defaults: {
          preferredModelProfileIds: ['cloud_frontier_reasoning'],
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual(
      expect.objectContaining({
        level: 'application',
        application: 'thingstead',
      }),
    );

    const listResponse = await injectAuthorized(app, {
      method: 'GET',
      url: '/policies?level=application',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ application: 'thingstead' }),
      ]),
    );
  });

  it('returns provider detail with health and supports the legacy /test alias', async () => {
    const app = await makeApp();
    _app = app;

    const detailResponse = await injectAuthorized(app, {
      method: 'GET',
      url: '/providers/prov-openai',
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: 'prov-openai',
        health: expect.objectContaining({
          status: 'healthy',
          latencyMs: 182,
        }),
      }),
    );

    const testResponse = await injectAuthorized(app, {
      method: 'POST',
      url: '/providers/prov-openai/test',
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toEqual(
      expect.objectContaining({
        status: 'healthy',
        latencyMs: 182,
      }),
    );
  });

  it('filters execution listings and returns stable detail fields', async () => {
    const app = await makeApp();
    _app = app;

    const listResponse = await injectAuthorized(app, {
      method: 'GET',
      url: '/executions?status=succeeded&application=process_swarm',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
    expect(listResponse.json()[0]).toEqual(
      expect.objectContaining({
        id: 'exec-1',
        status: 'succeeded',
      }),
    );

    const detailResponse = await injectAuthorized(app, {
      method: 'GET',
      url: '/executions/exec-1',
    });

    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json();
    expect(detail.id).toBe('exec-1');
    expect(detail.rationaleSummary).toContain('process_swarm');
    expect(detail.rationaleSummary).toContain('prov-openai');
    expect(detail.fallbackHistory).toEqual([]);
  });

  it('creates, retrieves, and deletes a model profile', async () => {
    const app = await makeApp();
    _app = app;

    const createResponse = await injectAuthorized(app, {
      method: 'POST',
      url: '/profiles/model',
      payload: {
        name: 'test_model',
        description: 'Integration test model profile',
        supportedTaskTypes: ['analytical'],
        supportedLoadTiers: ['single_shot'],
        minimumCognitiveGrade: 'standard',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.name).toBe('test_model');

    const getResponse = await injectAuthorized(app, {
      method: 'GET',
      url: `/profiles/model/${created.id}`,
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().name).toBe('test_model');

    const deleteResponse = await injectAuthorized(app, {
      method: 'DELETE',
      url: `/profiles/model/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const getAfterDelete = await injectAuthorized(app, {
      method: 'GET',
      url: `/profiles/model/${created.id}`,
    });

    expect(getAfterDelete.statusCode).toBe(404);
  });

  it('creates, retrieves, and deletes a tactic profile', async () => {
    const app = await makeApp();
    _app = app;

    const createResponse = await injectAuthorized(app, {
      method: 'POST',
      url: '/profiles/tactic',
      payload: {
        name: 'test_tactic',
        description: 'Integration test tactic profile',
        executionMethod: 'chain_of_thought',
        supportedTaskTypes: ['generation'],
        supportedLoadTiers: ['batch'],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.name).toBe('test_tactic');
    expect(created.executionMethod).toBe('chain_of_thought');

    const deleteResponse = await injectAuthorized(app, {
      method: 'DELETE',
      url: `/profiles/tactic/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it('returns 404 when deleting a non-existent profile', async () => {
    const app = await makeApp();
    _app = app;

    const response = await injectAuthorized(app, {
      method: 'DELETE',
      url: '/profiles/model/non-existent-id',
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects deletion of global policy with 405', async () => {
    const app = await makeApp();
    _app = app;

    const response = await injectAuthorized(app, {
      method: 'DELETE',
      url: '/policies/global-policy',
    });

    expect(response.statusCode).toBe(405);
    expect(response.json().message).toContain('Global policy');
  });

  it('deletes an application policy and confirms removal', async () => {
    const app = await makeApp();
    _app = app;

    const deleteResponse = await injectAuthorized(app, {
      method: 'DELETE',
      url: '/policies/app-policy',
    });

    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await injectAuthorized(app, {
      method: 'GET',
      url: '/policies?level=application',
    });

    expect(listResponse.statusCode).toBe(200);
    const policies = listResponse.json();
    expect(policies.find((p: any) => p.id === 'app-policy')).toBeUndefined();
  });

  it('rejects tactic profile creation without executionMethod', async () => {
    const app = await makeApp();
    _app = app;

    const response = await injectAuthorized(app, {
      method: 'POST',
      url: '/profiles/tactic',
      payload: {
        name: 'bad_tactic',
        description: 'Missing executionMethod',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('executionMethod');
  });
});
