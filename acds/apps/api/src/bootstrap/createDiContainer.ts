import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Provider, ModelProfile, TacticProfile, RoutingRequest } from '@acds/core-types';
import { ProviderVendor } from '@acds/core-types';
import { TaskType, LoadTier } from '@acds/core-types';
import { FileKeyResolver, SecretRotationService } from '@acds/security';
import { RoutingAuditWriter, ExecutionAuditWriter } from '@acds/audit-ledger';
import {
  ProviderRegistryService,
  ProviderValidationService,
  AdapterResolver,
  ProviderConnectionTester,
  ProviderExecutionProxy,
  ProviderHealthService,
} from '@acds/provider-broker';
import { OpenAIAdapter, OllamaAdapter, LMStudioAdapter, GeminiAdapter, AppleIntelligenceAdapter, type AdapterRequest, type AdapterResponse } from '@acds/provider-adapters';
import { DispatchResolver, type DispatchResult } from '@acds/routing-engine';
import { DispatchRunService, ExecutionRecordService, ExecutionStatusTracker } from '@acds/execution-orchestrator';
import { createPool, PgProviderRepository, PgProviderHealthRepository, PgExecutionRecordRepository, PgOptimizerStateRepository, PgAdaptationApprovalRepository, PgPolicyRepository, PgAuditEventRepository, PgFamilyPerformanceRepository, PgAdaptationEventRepository, PgAdaptationRecommendationRepository, PgSecretCipherStore, PgRollbackRecordWriter, PgApprovalAuditEmitter, PgRollbackAuditEmitter, PgAuditEventWriter } from '@acds/persistence-pg';
import { PolicyMergeResolver, normalizeInstanceContext, computeInstanceOverrides, type EffectivePolicy } from '@acds/policy-engine';
import { AdaptationRollbackService, type AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import type { CandidatePerformanceState } from '@acds/adaptive-optimizer';
import type { DispatchResolverDeps } from '@acds/routing-engine';
import type { AppConfig } from '../config/index.js';
import type { FastifyInstance } from 'fastify';
import { ProfileCatalogService } from '../services/ProfileCatalogService.js';

type ModelProfileSeed = Omit<ModelProfile, 'id' | 'description' | 'enabled' | 'createdAt' | 'updatedAt'> & {
  name: string;
};

type TacticProfileSeed = Omit<TacticProfile, 'id' | 'description' | 'enabled' | 'createdAt' | 'updatedAt' | 'systemPromptTemplate' | 'outputSchema' | 'maxRetries' | 'temperature' | 'topP'> & {
  name: string;
};


class EnvAwareConnectionTester {
  constructor(
    private readonly providerRepository: PgProviderRepository,
    private readonly tester: ProviderConnectionTester,
  ) {}

  async testConnection(provider: Provider) {
    const apiKey = await resolveProviderApiKey(this.providerRepository, provider.id);
    return this.tester.testConnection(provider, apiKey);
  }
}



class OptimizerCandidateReader {
  constructor(private readonly optimizerRepository: PgOptimizerStateRepository) {}

  async getCandidatesForFamily(familyKey: string): Promise<CandidatePerformanceState[]> {
    return this.optimizerRepository.getCandidateStates(familyKey);
  }
}


async function loadJson<T>(relativePath: string): Promise<T> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readFile(absolutePath, 'utf8');
  return JSON.parse(content) as T;
}

function toModelProfiles(seeds: ModelProfileSeed[]): ModelProfile[] {
  const now = new Date();
  return seeds.map((seed) => ({
    id: seed.name,
    name: seed.name,
    description: `${seed.name} profile`,
    vendor: seed.vendor,
    modelId: seed.modelId,
    supportedTaskTypes: seed.supportedTaskTypes,
    supportedLoadTiers: seed.supportedLoadTiers,
    minimumCognitiveGrade: seed.minimumCognitiveGrade,
    contextWindow: seed.contextWindow,
    maxTokens: seed.maxTokens,
    costPer1kInput: seed.costPer1kInput,
    costPer1kOutput: seed.costPer1kOutput,
    localOnly: seed.localOnly,
    cloudAllowed: seed.cloudAllowed,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
}

function toTacticProfiles(seeds: TacticProfileSeed[]): TacticProfile[] {
  const now = new Date();
  return seeds.map((seed) => ({
    id: seed.name,
    name: seed.name,
    description: `${seed.name} tactic`,
    executionMethod: seed.executionMethod,
    systemPromptTemplate: '',
    outputSchema: undefined,
    maxRetries: 0,
    temperature: 0,
    topP: 1,
    supportedTaskTypes: Object.values(TaskType),
    supportedLoadTiers: Object.values(LoadTier),
    multiStage: seed.multiStage,
    requiresStructuredOutput: seed.requiresStructuredOutput,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
}

function defaultEffectivePolicy(request: RoutingRequest): EffectivePolicy {
  return {
    allowedVendors: [ProviderVendor.OLLAMA, ProviderVendor.LMSTUDIO, ProviderVendor.GEMINI, ProviderVendor.OPENAI],
    blockedVendors: [],
    privacy: request.constraints.privacy,
    costSensitivity: request.constraints.costSensitivity,
    structuredOutputRequired: request.constraints.structuredOutputRequired,
    traceabilityRequired: request.constraints.traceabilityRequired,
    maxLatencyMs: request.constraints.maxLatencyMs,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: false,
  };
}

async function buildResolverDeps(
  request: RoutingRequest,
  providerRepository: PgProviderRepository,
  policyRepository: PgPolicyRepository,
  profiles: ModelProfile[],
  tactics: TacticProfile[],
): Promise<DispatchResolverDeps> {
  const providers = await providerRepository.findEnabled();
  const enabledProviders: Provider[] = providers;
  const profileProviderMap = new Map<string, string>();

  for (const profile of profiles) {
    const provider = enabledProviders.find((entry) => entry.vendor === profile.vendor);
    if (provider) {
      profileProviderMap.set(profile.id, provider.id);
    }
  }

  const mergeResolver = new PolicyMergeResolver();
  const globalPolicy = await policyRepository.getGlobalPolicy();
  const applicationPolicy = await policyRepository.findApplicationPolicy(request.application);
  const processPolicy = await policyRepository.findProcessPolicy(
    request.application,
    request.process,
    request.step,
  );

  const effectivePolicy = globalPolicy
    ? mergeResolver.merge(
        globalPolicy,
        applicationPolicy,
        processPolicy,
        computeInstanceOverrides(normalizeInstanceContext(request.instanceContext)),
        request.cognitiveGrade,
        request.loadTier,
      )
    : defaultEffectivePolicy(request);

  return {
    allProfiles: profiles.filter((profile) => profile.enabled),
    allTactics: tactics.filter((tactic) => tactic.enabled),
    profileProviderMap,
    effectivePolicy,
  };
}

async function resolveProviderApiKey(providerRepository: PgProviderRepository, providerId: string): Promise<string | undefined> {
  const provider = await providerRepository.findById(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  switch (provider.vendor) {
    case ProviderVendor.OPENAI:
      return process.env.OPENAI_API_KEY;
    case ProviderVendor.GEMINI:
      return process.env.GEMINI_API_KEY;
    case ProviderVendor.APPLE:
      return undefined;
    default:
      return undefined;
  }
}

export async function createDiContainer(config: AppConfig): Promise<FastifyInstance['diContainer']> {
  const databaseUrl = new URL(config.databaseUrl);
  const pool = createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
  const providerRepository = new PgProviderRepository(pool);
  const providerHealthRepository = new PgProviderHealthRepository(pool);
  const executionRecordRepository = new PgExecutionRecordRepository(pool);
  const optimizerRepository = new PgOptimizerStateRepository(pool);
  const approvalRepository = new PgAdaptationApprovalRepository(pool);
  const policyRepository = new PgPolicyRepository(pool);

  const adapterResolver = new AdapterResolver();
  adapterResolver.register('openai', new OpenAIAdapter());
  adapterResolver.register('ollama', new OllamaAdapter());
  adapterResolver.register('lmstudio', new LMStudioAdapter());
  adapterResolver.register('gemini', new GeminiAdapter());
  adapterResolver.register('apple', new AppleIntelligenceAdapter());

  const providerExecutionProxy = new ProviderExecutionProxy(adapterResolver);
  const providerHealthService = new ProviderHealthService(providerHealthRepository);
  const providerRegistryService = new ProviderRegistryService(
    providerRepository,
    new ProviderValidationService(),
  );
  const connectionTester = new EnvAwareConnectionTester(
    providerRepository,
    new ProviderConnectionTester(adapterResolver),
  );
  const secretStore = new PgSecretCipherStore(pool);
  const secretRotationService = new SecretRotationService(
    secretStore,
    new FileKeyResolver(config.masterKeyPath),
  );

  const modelProfiles = toModelProfiles(
    await loadJson<ModelProfileSeed[]>('infra/config/profiles/modelProfiles.json'),
  );
  const tacticProfiles = toTacticProfiles(
    await loadJson<TacticProfileSeed[]>('infra/config/profiles/tacticProfiles.json'),
  );
  const modelProfileById = new Map(modelProfiles.map((profile) => [profile.id, profile]));
  const profileCatalogService = new ProfileCatalogService(modelProfiles, tacticProfiles);

  const dispatchResolver = new DispatchResolver();
  const executionRecordService = new ExecutionRecordService(executionRecordRepository);
  const statusTracker = new ExecutionStatusTracker(executionRecordRepository);
  const auditEventWriter = new PgAuditEventWriter(pool);
  const routingAuditWriter = new RoutingAuditWriter(auditEventWriter);
  const executionAuditWriter = new ExecutionAuditWriter(auditEventWriter);
  const adaptationEventRepo = new PgAdaptationEventRepository(pool);
  const rollbackService = new AdaptationRollbackService(
    adaptationEventRepo,
    optimizerRepository,
    new PgRollbackRecordWriter(pool),
    new PgRollbackAuditEmitter(pool),
  );

  const dispatchRunService = new DispatchRunService(statusTracker, {
    resolveRoute: async (request: RoutingRequest): Promise<DispatchResult> => {
      const deps = await buildResolverDeps(
        request,
        providerRepository,
        policyRepository,
        modelProfiles,
        tacticProfiles,
      );
      return dispatchResolver.resolve(request, deps);
    },
    executeProvider: async (providerId: string, request: AdapterRequest, apiKey?: string): Promise<AdapterResponse> => {
      const provider = await providerRepository.findById(providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
      }
      return providerExecutionProxy.execute(provider, request, apiKey);
    },
    resolveApiKey: async (providerId: string) => resolveProviderApiKey(providerRepository, providerId),
    resolveModelId: async (modelProfileId: string) => {
      const profile = modelProfileById.get(modelProfileId);
      if (!profile) {
        throw new Error(`Model profile not found: ${modelProfileId}`);
      }
      return profile.modelId;
    },
    writeRouteResolved: routingAuditWriter.writeRouteResolved.bind(routingAuditWriter),
    writeRouteFallback: routingAuditWriter.writeRouteFallback.bind(routingAuditWriter),
    writeExecutionStarted: executionAuditWriter.writeExecutionStarted.bind(executionAuditWriter),
    writeExecutionCompleted: executionAuditWriter.writeExecutionCompleted.bind(executionAuditWriter),
    writeExecutionFailed: executionAuditWriter.writeExecutionFailed.bind(executionAuditWriter),
  });

  const container: FastifyInstance['diContainer'] = {
    providerHealthService,
    registryService: providerRegistryService,
    profileCatalogService,
    policyRepository,
    connectionTester,
    secretRotationService,
    dispatchRunService,
    executionRecordService,
    auditEventReader: new PgAuditEventRepository(pool),
    familyPerformanceReader: new PgFamilyPerformanceRepository(pool),
    candidateRankingReader: new OptimizerCandidateReader(optimizerRepository),
    adaptationEventReader: adaptationEventRepo,
    adaptationRecommendationReader: new PgAdaptationRecommendationRepository(pool),
    adaptationApprovalRepository: approvalRepository as AdaptationApprovalRepository,
    approvalAuditEmitter: new PgApprovalAuditEmitter(pool),
    adaptationRollbackService: rollbackService,
    resolve<T>(name: string): T {
      return this[name] as T;
    },
  };

  return container;
}
