import {
  AuthType,
  CognitiveGrade,
  ProviderVendor,
  type ModelProfile,
  type Provider,
  type ProviderHealth,
  type TacticProfile,
} from '@acds/core-types';
import type { AuditEvent } from '../features/audit/auditApi';
import type {
  ApprovalDecisionResponse,
  ApprovalDetailView,
  ApprovalView,
} from '../features/adaptation/adaptationApprovalApi';
import type { FamilyPerformanceView, CandidateView, AdaptationEventView, AdaptationRecommendationView } from '../features/adaptation/adaptationApi';
import type {
  RollbackCandidateView,
  RollbackExecutionResponse,
  RollbackHistoryView,
  RollbackPreviewView,
} from '../features/adaptation/adaptationRollbackApi';
import type { PolicyRecord, PolicyPayload } from '../features/policies/policiesApi';
import type { ExecutionDetail, ExecutionFilters } from '../features/executions/executionsApi';
import type { CreateProfilePayload } from '../features/profiles/profilesApi';
import type { CreateProviderPayload, UpdateProviderPayload } from '../features/providers/providersApi';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const now = () => new Date().toISOString();
const nowDate = () => new Date();

const providers: Array<Provider & { health: ProviderHealth }> = [
  {
    id: 'prov-ollama-local',
    name: 'Ollama Local',
    vendor: ProviderVendor.OLLAMA,
    authType: AuthType.NONE,
    baseUrl: 'http://localhost:11434',
    enabled: true,
    environment: 'local',
    createdAt: nowDate(),
    updatedAt: nowDate(),
    health: {
      providerId: 'prov-ollama-local',
      status: 'healthy',
      lastTestAt: nowDate(),
      lastSuccessAt: nowDate(),
      lastFailureAt: null,
      latencyMs: 48,
      message: 'Local adapter responding normally.',
    },
  },
  {
    id: 'prov-openai-prod',
    name: 'OpenAI Production',
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'production',
    createdAt: nowDate(),
    updatedAt: nowDate(),
    health: {
      providerId: 'prov-openai-prod',
      status: 'healthy',
      lastTestAt: nowDate(),
      lastSuccessAt: nowDate(),
      lastFailureAt: null,
      latencyMs: 182,
      message: 'Connection verified successfully.',
    },
  },
  {
    id: 'prov-apple-local',
    name: 'Apple Intelligence (Local)',
    vendor: ProviderVendor.APPLE,
    authType: AuthType.NONE,
    baseUrl: 'http://localhost:11435',
    enabled: true,
    environment: 'local',
    createdAt: nowDate(),
    updatedAt: nowDate(),
    health: {
      providerId: 'prov-apple-local',
      status: 'healthy',
      lastTestAt: nowDate(),
      lastSuccessAt: nowDate(),
      lastFailureAt: null,
      latencyMs: 12,
      message: 'Apple Intelligence bridge responding on localhost.',
    },
  },
];

const modelProfiles: ModelProfile[] = [
  {
    id: 'cloud_frontier_reasoning',
    name: 'cloud_frontier_reasoning',
    description: 'High-capability cloud reasoning profile',
    vendor: ProviderVendor.OPENAI,
    modelId: 'gpt-4.1',
    supportedTaskTypes: ['analysis', 'reasoning'] as any,
    supportedLoadTiers: ['standard', 'heavy'] as any,
    minimumCognitiveGrade: CognitiveGrade.ENHANCED,
    contextWindow: 128000,
    maxTokens: 8192,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    supportedTaskTypes: ['analysis', 'generation'] as any,
    supportedLoadTiers: ['light', 'standard'] as any,
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const policies: PolicyRecord[] = [
  {
    id: 'global-policy',
    level: 'global',
    allowedVendors: ['openai', 'ollama'],
    blockedVendors: [],
    defaults: { privacy: 'cloud_allowed', costSensitivity: 'medium' },
    constraints: { maxLatencyMsByLoadTier: { standard: 5000 } },
    enabled: true,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'process-swarm-policy',
    level: 'application',
    application: 'process_swarm',
    allowedVendors: ['openai'],
    blockedVendors: [],
    defaults: { preferredModelProfileIds: ['cloud_frontier_reasoning'] },
    constraints: {},
    enabled: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

const familyPerformance: FamilyPerformanceView[] = [
  {
    familyKey: 'process_swarm.content_review.initial_draft.advisory.standard',
    rollingScore: 0.9142,
    trend: 'improving',
    runCount: 182,
    recentFailures: 1,
    metricTrends: [
      { label: 'quality', mean: 0.93, latest: 0.95 },
      { label: 'latency', mean: 910, latest: 860 },
    ],
    lastUpdated: now(),
  },
];

const candidates: CandidateView[] = [
  {
    candidateId: 'openai:cloud_frontier_reasoning:single_pass_fast',
    familyKey: familyPerformance[0]!.familyKey,
    rollingScore: 0.9142,
    runCount: 182,
    successRate: 0.98,
    averageLatency: 860,
    lastSelectedAt: now(),
  },
];

const adaptationEvents: AdaptationEventView[] = [
  {
    id: 'evt-1',
    familyKey: familyPerformance[0]!.familyKey,
    trigger: 'plateau_detected',
    mode: 'recommend_only',
    previousRankingCount: 2,
    newRankingCount: 2,
    evidenceSummary: 'Quality remains high while latency improved.',
    createdAt: now(),
  },
];

const recommendations: AdaptationRecommendationView[] = [
  {
    id: 'rec-1',
    familyKey: familyPerformance[0]!.familyKey,
    evidence: 'Candidate ranking remains stable.',
    status: 'pending',
    createdAt: now(),
  },
];

const approvals: ApprovalDetailView[] = [
  {
    id: 'approval-1',
    familyKey: familyPerformance[0]!.familyKey,
    recommendationId: recommendations[0]!.id,
    status: 'pending',
    evidence: 'Primary candidate continues to outperform the runner-up on quality and latency.',
    currentRankingCount: 2,
    proposedRankingCount: 2,
    adaptiveMode: 'recommend_only',
    submittedAt: now(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    previousRanking: [
      {
        candidateId: 'ollama:local_reasoning:single_pass_fast',
        rank: 1,
        score: 0.8912,
      },
      {
        candidateId: candidates[0]!.candidateId,
        rank: 2,
        score: 0.8821,
      },
    ],
    proposedRanking: [
      {
        candidateId: candidates[0]!.candidateId,
        rank: 1,
        score: 0.9142,
      },
      {
        candidateId: 'ollama:local_reasoning:single_pass_fast',
        rank: 2,
        score: 0.8874,
      },
    ],
  },
];

const rollbackCandidates: RollbackCandidateView[] = [
  {
    familyKey: familyPerformance[0]!.familyKey,
    targetAdaptationEventId: adaptationEvents[0]!.id,
    trigger: adaptationEvents[0]!.trigger,
    eventCreatedAt: adaptationEvents[0]!.createdAt,
    candidateCount: 2,
  },
];

const rollbackHistory: RollbackHistoryView[] = [];

const auditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    eventType: 'provider_created',
    actor: 'operator@acds',
    application: 'admin_web',
    action: 'provider.registered',
    target: 'prov-openai-prod',
    details: {},
    timestamp: now(),
  },
];

const executions: ExecutionDetail[] = [
  {
    id: 'exec-1',
    executionFamily: {
      application: 'process_swarm',
      process: 'content_review',
      step: 'initial_draft',
      decisionPosture: 'advisory' as any,
      cognitiveGrade: 'standard' as any,
    },
    routingDecisionId: 'route-1',
    selectedModelProfileId: 'cloud_frontier_reasoning',
    selectedTacticProfileId: 'single_pass_fast',
    selectedProviderId: 'prov-openai-prod',
    status: 'succeeded',
    inputTokens: 842,
    outputTokens: 221,
    latencyMs: 860,
    costEstimate: 0.0142,
    normalizedOutput: 'Draft completed successfully.',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date(),
    completedAt: new Date(),
    rationaleSummary: 'Selected cloud reasoning profile for best quality/latency balance.',
    fallbackHistory: [],
  },
];

function asJson<T>(value: T): Promise<T> {
  return Promise.resolve(structuredClone(value));
}

function notFound(path: string): never {
  throw new Error(`Mock resource not found for ${path}`);
}

function matchesFamilyKey(candidateFamilyKey: string, filterFamilyKey?: string): boolean {
  if (!filterFamilyKey) {
    return true;
  }
  return candidateFamilyKey.includes(filterFamilyKey);
}

function buildRollbackSnapshot(rankings: ApprovalDetailView['proposedRanking']) {
  return {
    familyKey: familyPerformance[0]!.familyKey,
    candidateRankings: rankings.map((entry) => ({
      candidateId: entry.candidateId,
      rank: entry.rank,
      score: entry.score,
    })),
    explorationRate: 0.08,
    capturedAt: now(),
  };
}

export async function mockRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>,
): Promise<T> {
  if (method === 'GET' && path === '/providers') {
    return asJson(providers.map(({ health, ...provider }) => provider) as T);
  }
  if (method === 'GET' && path.startsWith('/providers/')) {
    const id = path.split('/')[2];
    return asJson((providers.find((provider) => provider.id === id) ?? null) as T);
  }
  if (method === 'POST' && path === '/providers') {
    const payload = body as CreateProviderPayload;
    const provider: Provider & { health: ProviderHealth } = {
      id: `prov-${payload.vendor}-${providers.length + 1}`,
      name: payload.name,
      vendor: payload.vendor as ProviderVendor,
      authType: payload.authType as AuthType,
      baseUrl: payload.baseUrl,
      enabled: true,
      environment: payload.environment,
      createdAt: nowDate(),
      updatedAt: nowDate(),
      health: {
        providerId: `prov-${payload.vendor}-${providers.length + 1}`,
        status: 'unknown',
        lastTestAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        latencyMs: null,
        message: null,
      },
    };
    providers.unshift(provider);
    return asJson(provider as T);
  }
  if (method === 'PATCH' && path.startsWith('/providers/')) {
    const id = path.split('/')[2];
    const provider = providers.find((entry) => entry.id === id);
    if (provider) Object.assign(provider, body as UpdateProviderPayload, { updatedAt: nowDate() });
    return asJson(provider as T);
  }
  if (method === 'POST' && path.endsWith('/disable')) {
    const id = path.split('/')[2];
    const provider = providers.find((entry) => entry.id === id);
    if (provider) {
      provider.enabled = false;
      provider.updatedAt = nowDate();
    }
    return asJson(provider as T);
  }
  if (method === 'POST' && path.endsWith('/test-connection')) {
    const id = path.split('/')[2];
    const provider = providers.find((entry) => entry.id === id);
    return asJson((provider?.health ?? null) as T);
  }

  if (method === 'GET' && path === '/profiles/model') return asJson(modelProfiles as T);
  if (method === 'GET' && path.startsWith('/profiles/model/')) {
    const id = path.split('/')[3];
    return asJson((modelProfiles.find((profile) => profile.id === id) ?? notFound(path)) as T);
  }
  if (method === 'GET' && path === '/profiles/tactic') return asJson(tacticProfiles as T);
  if (method === 'GET' && path.startsWith('/profiles/tactic/')) {
    const id = path.split('/')[3];
    return asJson((tacticProfiles.find((profile) => profile.id === id) ?? notFound(path)) as T);
  }
  if (method === 'POST' && path === '/profiles/model') {
    const payload = body as CreateProfilePayload & Record<string, unknown>;
    const profile: ModelProfile = {
      id: payload.name,
      name: payload.name,
      description: String(payload.description ?? `${payload.name} profile`),
      vendor: ProviderVendor.OPENAI,
      modelId: payload.name,
      supportedTaskTypes: (payload.supportedTaskTypes as any[]) ?? [],
      supportedLoadTiers: (payload.supportedLoadTiers as any[]) ?? [],
      minimumCognitiveGrade: (payload.minimumCognitiveGrade as CognitiveGrade) ?? CognitiveGrade.STANDARD,
      contextWindow: 8192,
      maxTokens: 2048,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      localOnly: false,
      cloudAllowed: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    modelProfiles.unshift(profile);
    return asJson(profile as T);
  }
  if (method === 'POST' && path === '/profiles/tactic') {
    const payload = body as CreateProfilePayload & Record<string, unknown>;
    const profile: TacticProfile = {
      id: payload.name,
      name: payload.name,
      description: String(payload.description ?? `${payload.name} tactic`),
      executionMethod: String(payload.executionMethod ?? 'single_pass'),
      systemPromptTemplate: '',
      outputSchema: undefined,
      maxRetries: 0,
      temperature: 0,
      topP: 1,
      supportedTaskTypes: (payload.supportedTaskTypes as any[]) ?? [],
      supportedLoadTiers: (payload.supportedLoadTiers as any[]) ?? [],
      multiStage: Boolean(payload.multiStage),
      requiresStructuredOutput: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tacticProfiles.unshift(profile);
    return asJson(profile as T);
  }
  if (method === 'PATCH' && path.startsWith('/profiles/model/')) {
    const id = path.split('/')[3];
    const profile = modelProfiles.find((entry) => entry.id === id);
    if (!profile) {
      return notFound(path);
    }
    Object.assign(profile, body as Partial<ModelProfile>, { updatedAt: new Date() });
    return asJson(profile as T);
  }
  if (method === 'PATCH' && path.startsWith('/profiles/tactic/')) {
    const id = path.split('/')[3];
    const profile = tacticProfiles.find((entry) => entry.id === id);
    if (!profile) {
      return notFound(path);
    }
    Object.assign(profile, body as Partial<TacticProfile>, { updatedAt: new Date() });
    return asJson(profile as T);
  }
  if (method === 'DELETE' && path.startsWith('/profiles/model/')) {
    const id = path.split('/')[3];
    const index = modelProfiles.findIndex((entry) => entry.id === id);
    if (index >= 0) modelProfiles.splice(index, 1);
    return asJson(undefined as T);
  }
  if (method === 'DELETE' && path.startsWith('/profiles/tactic/')) {
    const id = path.split('/')[3];
    const index = tacticProfiles.findIndex((entry) => entry.id === id);
    if (index >= 0) tacticProfiles.splice(index, 1);
    return asJson(undefined as T);
  }

  if (method === 'GET' && path === '/policies') {
    const level = params?.level;
    return asJson((level ? policies.filter((policy) => policy.level === level) : policies) as T);
  }
  if (method === 'GET' && path.startsWith('/policies/')) {
    const id = path.split('/')[2];
    return asJson((policies.find((policy) => policy.id === id) ?? notFound(path)) as T);
  }
  if (method === 'POST' && path === '/policies') {
    const payload = body as PolicyPayload;
    const policy: PolicyRecord = {
      id: `policy-${policies.length + 1}`,
      level: payload.level,
      application: payload.application,
      process: payload.process,
      allowedVendors: payload.allowedVendors ?? [],
      blockedVendors: payload.blockedVendors ?? [],
      defaults: payload.defaults ?? {},
      constraints: payload.constraints ?? {},
      enabled: payload.enabled ?? true,
      createdAt: now(),
      updatedAt: now(),
    };
    policies.unshift(policy);
    return asJson(policy as T);
  }
  if (method === 'PATCH' && path.startsWith('/policies/')) {
    const id = path.split('/')[2];
    const policy = policies.find((entry) => entry.id === id);
    if (policy) Object.assign(policy, body as Partial<PolicyRecord>, { updatedAt: now() });
    return asJson(policy as T);
  }
  if (method === 'DELETE' && path.startsWith('/policies/')) {
    const id = path.split('/')[2];
    const index = policies.findIndex((entry) => entry.id === id);
    if (index >= 0) policies.splice(index, 1);
    return asJson(undefined as T);
  }

  if (method === 'GET' && path === '/adaptation/families') return asJson(familyPerformance as T);
  if (method === 'GET' && path.startsWith('/adaptation/families/') && path.endsWith('/candidates')) {
    const familyKey = decodeURIComponent(path.split('/')[3] ?? '');
    return asJson(candidates.filter((entry) => entry.familyKey === familyKey) as T);
  }
  if (method === 'GET' && path.startsWith('/adaptation/families/')) {
    const familyKey = decodeURIComponent(path.split('/')[3] ?? '');
    return asJson((familyPerformance.find((entry) => entry.familyKey === familyKey) ?? null) as T);
  }
  if (method === 'GET' && path === '/adaptation/events') return asJson(adaptationEvents as T);
  if (method === 'GET' && path === '/adaptation/recommendations') return asJson(recommendations as T);
  if (method === 'GET' && path === '/adaptation/approvals') {
    let filtered: ApprovalView[] = approvals;
    if (params?.status) {
      filtered = filtered.filter((approval) => approval.status === params.status);
    }
    if (params?.familyKey) {
      filtered = filtered.filter((approval) => matchesFamilyKey(approval.familyKey, params.familyKey));
    }
    return asJson(filtered as T);
  }
  if (method === 'GET' && path.startsWith('/adaptation/approvals/')) {
    const id = decodeURIComponent(path.split('/')[3] ?? '');
    return asJson((approvals.find((approval) => approval.id === id) ?? notFound(path)) as T);
  }
  if (method === 'POST' && path.endsWith('/approve')) {
    const id = decodeURIComponent(path.split('/')[3] ?? '');
    const approval = approvals.find((entry) => entry.id === id);
    if (!approval) {
      return notFound(path);
    }
    const payload = (body as { reason?: string } | undefined) ?? {};
    approval.status = 'approved';
    approval.reason = payload.reason;
    approval.decidedAt = now();
    approval.decidedBy = 'mock.operator@acds';
    const response: ApprovalDecisionResponse = {
      id: approval.id,
      status: approval.status,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    };
    return asJson(response as T);
  }
  if (method === 'POST' && path.endsWith('/reject')) {
    const id = decodeURIComponent(path.split('/')[3] ?? '');
    const approval = approvals.find((entry) => entry.id === id);
    if (!approval) {
      return notFound(path);
    }
    const payload = (body as { reason?: string } | undefined) ?? {};
    approval.status = 'rejected';
    approval.reason = payload.reason;
    approval.decidedAt = now();
    approval.decidedBy = 'mock.operator@acds';
    const response: ApprovalDecisionResponse = {
      id: approval.id,
      status: approval.status,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    };
    return asJson(response as T);
  }
  if (method === 'GET' && path === '/adaptation/rollbacks/candidates') {
    const filtered = rollbackCandidates.filter((candidate) =>
      matchesFamilyKey(candidate.familyKey, params?.familyKey),
    );
    return asJson(filtered as T);
  }
  if (method === 'GET' && path === '/adaptation/rollbacks/history') {
    const filtered = rollbackHistory.filter((entry) =>
      matchesFamilyKey(entry.familyKey, params?.familyKey),
    );
    return asJson(filtered as T);
  }
  if (method === 'POST' && path.includes('/adaptation/rollbacks/') && path.endsWith('/preview')) {
    const familyKey = decodeURIComponent(path.split('/')[3] ?? '');
    const payload = body as { targetEventId?: string } | undefined;
    const approval = approvals.find((entry) => entry.familyKey === familyKey);
    const preview: RollbackPreviewView = {
      safe: true,
      warnings: payload?.targetEventId ? [] : ['No target event specified'],
      currentSnapshot: buildRollbackSnapshot(approval?.proposedRanking ?? []),
      restoredSnapshot: buildRollbackSnapshot(approval?.previousRanking ?? []),
    };
    return asJson(preview as T);
  }
  if (method === 'POST' && path.includes('/adaptation/rollbacks/') && path.endsWith('/execute')) {
    const familyKey = decodeURIComponent(path.split('/')[3] ?? '');
    const payload = body as { targetEventId: string; reason: string };
    const entry: RollbackHistoryView = {
      id: `rollback-${rollbackHistory.length + 1}`,
      familyKey,
      targetAdaptationEventId: payload.targetEventId,
      actor: 'mock.operator@acds',
      reason: payload.reason,
      rolledBackAt: now(),
    };
    rollbackHistory.unshift(entry);
    const response: RollbackExecutionResponse = {
      id: entry.id,
      familyKey: entry.familyKey,
      targetAdaptationEventId: entry.targetAdaptationEventId,
      actor: entry.actor,
      reason: entry.reason,
      rolledBackAt: entry.rolledBackAt,
    };
    return asJson(response as T);
  }

  if (method === 'GET' && path === '/audit') {
    let filtered = [...auditEvents];
    if (params?.eventType) filtered = filtered.filter((event) => event.eventType === params.eventType);
    if (params?.actor) filtered = filtered.filter((event) => event.actor.includes(params.actor!));
    if (params?.application) filtered = filtered.filter((event) => event.application.includes(params.application!));
    return asJson(filtered as T);
  }
  if (method === 'GET' && path.startsWith('/audit/')) {
    const id = path.split('/')[2];
    return asJson((auditEvents.find((event) => event.id === id) ?? notFound(path)) as T);
  }

  if (method === 'GET' && path === '/executions') {
    let filtered = [...executions];
    const f = params as ExecutionFilters | undefined;
    if (f?.status) filtered = filtered.filter((execution) => execution.status === f.status);
    if (f?.application) filtered = filtered.filter((execution) => execution.executionFamily.application.includes(f.application!));
    if (f?.from) filtered = filtered.filter((execution) => execution.createdAt.toISOString() >= `${f.from}T00:00:00.000Z`);
    if (f?.to) filtered = filtered.filter((execution) => execution.createdAt.toISOString() <= `${f.to}T23:59:59.999Z`);
    return asJson(filtered as T);
  }
  if (method === 'GET' && path.startsWith('/executions/')) {
    const id = path.split('/')[2];
    return asJson((executions.find((entry) => entry.id === id) ?? null) as T);
  }

  if (method === 'GET' && path === '/apple-intelligence/health') {
    return asJson({
      status: 'healthy',
      platform: 'macOS',
      version: '1.0.0',
    } as T);
  }
  if (method === 'GET' && path === '/apple-intelligence/capabilities') {
    return asJson({
      models: ['apple-fm-fast', 'apple-fm-structured', 'apple-fm-reasoning'],
      supportedTaskTypes: ['classification', 'extraction', 'summarization', 'generation', 'decision_support'],
      maxTokens: 4096,
      platform: 'macOS',
    } as T);
  }
  if (method === 'POST' && path === '/apple-intelligence/execute') {
    const req = body as { model?: string; prompt?: string };
    return asJson({
      model: req?.model ?? 'apple-fm-fast',
      content: `[Apple Intelligence mock] Processed: ${(req?.prompt ?? '').slice(0, 80)}`,
      done: true,
      inputTokens: Math.ceil((req?.prompt?.length ?? 0) / 4),
      outputTokens: 24,
      durationMs: 42,
      capabilities: ['text-generation'],
    } as T);
  }

  throw new Error(`Mock API route not implemented: ${method} ${path}`);
}
