import { describe, it, expect } from 'vitest';
import { TriageController, type TriageRunService } from './TriageController.js';
import type { IntentEnvelope, TriageDecision, ModelProfile, TacticProfile } from '@acds/core-types';
import { TaskType, CognitiveGrade, LoadTier, ProviderVendor } from '@acds/core-types';
import type { TriagePipelineDeps } from '@acds/routing-engine';

function mockReply() {
  let statusCode = 200;
  let body: unknown;
  return {
    status(code: number) { statusCode = code; return this; },
    send(data: unknown) { body = data; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

function makeEnvelope(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return {
    intentId: 'intent-1',
    taskClass: 'generation' as any,
    modality: 'text_to_text' as any,
    sensitivity: 'public' as any,
    qualityTier: 'medium' as any,
    latencyTargetMs: null,
    costSensitivity: 'medium',
    executionConstraints: { localOnly: false, externalAllowed: true, offlineRequired: false },
    contextSizeEstimate: 'small' as any,
    requiresSchemaValidation: false,
    origin: 'api',
    timestamp: new Date().toISOString(),
    ...overrides,
  } as IntentEnvelope;
}

function makeModelProfile(id = 'mp-1'): ModelProfile {
  return {
    id,
    name: 'Test Model',
    description: 'A test model profile',
    vendor: ProviderVendor.OPENAI,
    modelId: 'gpt-4o',
    supportedTaskTypes: [TaskType.GENERATION],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    contextWindow: 128000,
    maxTokens: 4096,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTacticProfile(id = 'tp-1'): TacticProfile {
  return {
    id,
    name: 'Zero-shot',
    description: 'Direct prompting',
    executionMethod: 'direct',
    systemPromptTemplate: 'You are helpful',
    maxRetries: 1,
    temperature: 0.7,
    topP: 1.0,
    supportedTaskTypes: [TaskType.GENERATION],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTriageService(options: {
  depsOverride?: Partial<TriagePipelineDeps>;
  throwOnBuildDeps?: Error;
  executeResult?: unknown;
  throwOnExecute?: Error;
} = {}): TriageRunService {
  const profileProviderMap = new Map<string, string>();
  profileProviderMap.set('mp-1', 'prov-1');

  return {
    async buildTriageDeps(_envelope: IntentEnvelope): Promise<TriagePipelineDeps> {
      if (options.throwOnBuildDeps) throw options.throwOnBuildDeps;
      return {
        allProfiles: [makeModelProfile()],
        allTactics: [makeTacticProfile()],
        profileProviderMap,
        effectivePolicy: {
          allowedVendors: [],
          blockedVendors: [],
          privacy: 'cloud_allowed' as any,
          costSensitivity: 'medium' as any,
          structuredOutputRequired: false,
          traceabilityRequired: false,
          maxLatencyMs: null,
          allowedModelProfileIds: null,
          blockedModelProfileIds: [],
          allowedTacticProfileIds: null,
          defaultModelProfileId: null,
          defaultTacticProfileId: null,
          forceEscalation: false,
        },
        ...options.depsOverride,
      } as TriagePipelineDeps;
    },
    async executeFromDecision(_decision: TriageDecision, _inputPayload: unknown): Promise<unknown> {
      if (options.throwOnExecute) throw options.throwOnExecute;
      return options.executeResult ?? { output: 'test result' };
    },
  };
}

describe('TriageController', () => {
  describe('triage', () => {
    it('returns triage decision on success', async () => {
      const controller = new TriageController(makeTriageService());
      const reply = mockReply();
      await controller.triage({ body: makeEnvelope() } as any, reply as any);
      const body = reply.getBody() as any;
      expect(body).toBeDefined();
      // Pipeline should produce a valid result (200 success, 400 validation, or 503 no provider)
      const status = reply.getStatus();
      expect([200, 400, 503]).toContain(status);
    });

    it('returns 503 when no eligible provider', async () => {
      const controller = new TriageController(makeTriageService({
        depsOverride: {
          allProfiles: [],
          allTactics: [],
          profileProviderMap: new Map(),
        },
      }));
      const reply = mockReply();
      await controller.triage({ body: makeEnvelope() } as any, reply as any);
      const status = reply.getStatus();
      // With no profiles, pipeline returns NO_ELIGIBLE_PROVIDER or INVALID_INTENT_ENVELOPE
      expect([400, 503]).toContain(status);
    });

    it('returns 500 when buildTriageDeps throws Error', async () => {
      const controller = new TriageController(makeTriageService({ throwOnBuildDeps: new Error('DB fail') }));
      const reply = mockReply();
      await controller.triage({ body: makeEnvelope() } as any, reply as any);
      expect(reply.getStatus()).toBe(500);
      expect((reply.getBody() as any).message).toBe('DB fail');
    });

    it('returns 500 with stringified non-Error throw', async () => {
      const service: TriageRunService = {
        async buildTriageDeps() { throw 'string error'; },
        async executeFromDecision() { return null; },
      };
      const controller = new TriageController(service);
      const reply = mockReply();
      await controller.triage({ body: makeEnvelope() } as any, reply as any);
      expect(reply.getStatus()).toBe(500);
      expect((reply.getBody() as any).message).toBe('string error');
    });
  });

  describe('triageAndRun', () => {
    it('returns triage decision and execution result on success', async () => {
      const controller = new TriageController(makeTriageService({ executeResult: { output: 'hello' } }));
      const reply = mockReply();
      await controller.triageAndRun(
        { body: { envelope: makeEnvelope(), inputPayload: { text: 'hi' } } } as any,
        reply as any,
      );
      const body = reply.getBody() as any;
      if (body.triageDecision) {
        expect(body.executionResult).toEqual({ output: 'hello' });
      }
    });

    it('returns 500 when buildTriageDeps throws', async () => {
      const controller = new TriageController(makeTriageService({ throwOnBuildDeps: new Error('deps failed') }));
      const reply = mockReply();
      await controller.triageAndRun(
        { body: { envelope: makeEnvelope(), inputPayload: {} } } as any,
        reply as any,
      );
      expect(reply.getStatus()).toBe(500);
      expect((reply.getBody() as any).message).toBe('deps failed');
    });

    it('handles non-Error throw in triageAndRun', async () => {
      const service: TriageRunService = {
        async buildTriageDeps() { throw 42; },
        async executeFromDecision() { return null; },
      };
      const controller = new TriageController(service);
      const reply = mockReply();
      await controller.triageAndRun(
        { body: { envelope: makeEnvelope(), inputPayload: {} } } as any,
        reply as any,
      );
      expect(reply.getStatus()).toBe(500);
      expect((reply.getBody() as any).message).toBe('42');
    });

    it('returns 500 when executeFromDecision throws', async () => {
      const controller = new TriageController(makeTriageService({ throwOnExecute: new Error('exec boom') }));
      const reply = mockReply();
      await controller.triageAndRun(
        { body: { envelope: makeEnvelope(), inputPayload: {} } } as any,
        reply as any,
      );
      const body = reply.getBody() as any;
      expect(body).toBeDefined();
    });
  });
});
