import { describe, expect, it } from 'vitest';
import { CognitiveGrade, ProviderVendor } from '@acds/core-types';
import { ProvidersController } from '../../apps/api/src/controllers/ProvidersController.js';
import { ProfilesController } from '../../apps/api/src/controllers/ProfilesController.js';
import { PoliciesController } from '../../apps/api/src/controllers/PoliciesController.js';
import { ProfileCatalogService } from '../../apps/api/src/services/ProfileCatalogService.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe('Admin API controller surfaces', () => {
  it('includes provider health on provider detail responses', async () => {
    const controller = new ProvidersController(
      {
        getById: async () => ({
          id: 'prov-1',
          name: 'OpenAI Production',
          vendor: ProviderVendor.OPENAI,
          authType: 'api_key',
          baseUrl: 'https://api.openai.com',
          enabled: true,
          environment: 'production',
          createdAt: new Date('2026-03-15T18:41:00.000Z'),
          updatedAt: new Date('2026-03-15T18:41:00.000Z'),
        }),
      } as any,
      {} as any,
      {} as any,
      {
        getHealth: async () => ({
          providerId: 'prov-1',
          status: 'healthy',
          lastTestAt: new Date('2026-03-15T18:41:00.000Z'),
          lastSuccessAt: new Date('2026-03-15T18:41:00.000Z'),
          lastFailureAt: null,
          latencyMs: 182,
          message: 'Connection verified successfully.',
        }),
      } as any,
    );

    const reply = createReply();
    await controller.getById({ params: { id: 'prov-1' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).health).toMatchObject({
      status: 'healthy',
      latencyMs: 182,
    });
  });

  it('creates and lists model profiles through the catalog-backed controller', async () => {
    const catalog = new ProfileCatalogService([], []);
    const controller = new ProfilesController(catalog);

    const createReplyState = createReply();
    await controller.createModelProfile(
      {
        body: {
          name: 'cloud_reasoning_plus',
          supportedTaskTypes: ['analysis'],
          supportedLoadTiers: ['standard'],
          minimumCognitiveGrade: CognitiveGrade.ENHANCED,
        },
      } as any,
      createReplyState as any,
    );

    const listReplyState = createReply();
    await controller.listModelProfiles({} as any, listReplyState as any);

    expect(createReplyState.statusCode).toBe(201);
    expect((listReplyState.body as any[])).toHaveLength(1);
    expect((listReplyState.body as any[])[0]).toMatchObject({
      name: 'cloud_reasoning_plus',
      minimumCognitiveGrade: 'enhanced',
    });
  });

  it('lists global, application, and process policies in one API response', async () => {
    const controller = new PoliciesController({
      getGlobalPolicy: async () => ({
        id: 'global-1',
        allowedVendors: [ProviderVendor.OPENAI],
        blockedVendors: [],
        defaultPrivacy: 'cloud_allowed',
        defaultCostSensitivity: 'medium',
        structuredOutputRequiredForGrades: [],
        traceabilityRequiredForGrades: [],
        maxLatencyMsByLoadTier: {},
        localPreferredTaskTypes: [],
        cloudRequiredLoadTiers: [],
        enabled: true,
        updatedAt: new Date('2026-03-15T18:41:00.000Z'),
      }),
      listApplicationPolicies: async () => [
        {
          id: 'app-1',
          application: 'process_swarm',
          allowedVendors: [ProviderVendor.OPENAI],
          blockedVendors: null,
          privacyOverride: null,
          costSensitivityOverride: 'medium',
          preferredModelProfileIds: null,
          blockedModelProfileIds: null,
          localPreferredTaskTypes: null,
          structuredOutputRequiredForGrades: null,
          enabled: true,
          updatedAt: new Date('2026-03-15T18:41:00.000Z'),
        },
      ],
      listProcessPolicies: async () => [
        {
          id: 'proc-1',
          application: 'process_swarm',
          process: 'review',
          step: null,
          defaultModelProfileId: 'cloud_reasoning_plus',
          defaultTacticProfileId: 'single_pass_fast',
          allowedModelProfileIds: null,
          blockedModelProfileIds: null,
          allowedTacticProfileIds: null,
          privacyOverride: null,
          costSensitivityOverride: null,
          forceEscalationForGrades: null,
          enabled: true,
          updatedAt: new Date('2026-03-15T18:41:00.000Z'),
        },
      ],
    } as any);

    const reply = createReply();
    await controller.list({ query: {} } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any[]).map((policy) => policy.level)).toEqual([
      'global',
      'application',
      'process',
    ]);
  });
});
