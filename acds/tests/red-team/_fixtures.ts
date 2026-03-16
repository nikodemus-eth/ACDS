/**
 * ARGUS-9 Red Team Test Suite — Shared Fixtures
 *
 * Factory functions and in-memory repository implementations for adversarial tests.
 * All factories use Partial<T> override pattern: defaults are valid objects,
 * tests override specific fields to create adversarial conditions.
 */

import type {
  ModelProfile,
  TacticProfile,
  RoutingRequest,
  ProviderVendor,
} from '@acds/core-types';
import {
  TaskType,
  LoadTier,
  DecisionPosture,
  CognitiveGrade,
} from '@acds/core-types';

import type {
  FamilySelectionState,
  CandidatePerformanceState,
  OptimizerStateRepository,
  RankedCandidate,
  AdaptationEvent,
  AdaptationTrigger,
  AdaptationLedgerWriter,
  AdaptationEventFilters,
  AdaptationRecommendation,
  AdaptationApproval,
  AdaptationApprovalStatus,
  AdaptationApprovalRepository,
  RankingSnapshot,
  AdaptationRollbackRecord,
  RollbackRecordWriter,
  ApprovalAuditEvent,
  ApprovalAuditEmitter,
  RollbackAuditEvent,
  RollbackAuditEmitter,
  AdaptiveMode,
  ExplorationConfig,
  FamilyRiskProvider,
  FamilyPostureProvider,
  RecentFailureCounter,
  AutoApplyDecisionWriter,
  AutoApplyDecisionRecord,
  FamilyRiskLevel,
} from '@acds/adaptive-optimizer';

import type {
  EffectivePolicy,
  GlobalPolicy,
  ApplicationPolicy,
  ProcessPolicy,
  InstancePolicyOverrides,
} from '@acds/policy-engine';

// ─── Model Profile Factory ─────────────────────────────────

export function makeProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'profile-1',
    name: 'Test Profile',
    description: 'Default test profile',
    vendor: 'openai' as ProviderVendor,
    modelId: 'gpt-4',
    supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.GENERATION],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
    minimumCognitiveGrade: CognitiveGrade.STANDARD,
    contextWindow: 128000,
    maxTokens: 4096,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Tactic Profile Factory ────────────────────────────────

export function makeTactic(overrides: Partial<TacticProfile> = {}): TacticProfile {
  return {
    id: 'tactic-1',
    name: 'Test Tactic',
    description: 'Default test tactic',
    executionMethod: 'direct',
    systemPromptTemplate: 'You are a helpful assistant.',
    maxRetries: 3,
    temperature: 0.7,
    topP: 1.0,
    supportedTaskTypes: [TaskType.ANALYTICAL, TaskType.GENERATION],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT, LoadTier.BATCH],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Routing Request Factory ───────────────────────────────

export function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    application: 'test-app',
    process: 'test-process',
    step: 'test-step',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.ADVISORY,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'Test input data',
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: 5000,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

// ─── Policy Factories ──────────────────────────────────────

export function makeEffectivePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    allowedVendors: [],
    blockedVendors: [],
    privacy: 'cloud_allowed',
    costSensitivity: 'medium',
    structuredOutputRequired: false,
    traceabilityRequired: false,
    maxLatencyMs: 5000,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: false,
    ...overrides,
  };
}

export function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'global-1',
    allowedVendors: [],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeApplicationPolicy(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'app-policy-1',
    application: 'test-app',
    allowedVendors: null,
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeProcessPolicy(overrides: Partial<ProcessPolicy> = {}): ProcessPolicy {
  return {
    id: 'proc-policy-1',
    application: 'test-app',
    process: 'test-process',
    step: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: null,
    allowedTacticProfileIds: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    forceEscalationForGrades: null,
    enabled: true,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeInstanceOverrides(overrides: Partial<InstancePolicyOverrides> = {}): InstancePolicyOverrides {
  return {
    forceEscalation: false,
    forceLocalOnly: false,
    boostCostSensitivity: false,
    ...overrides,
  };
}

// ─── Adaptive State Factories ──────────────────────────────

export function makeFamilyState(overrides: Partial<FamilySelectionState> = {}): FamilySelectionState {
  return {
    familyKey: 'test-app:test-process:test-step',
    currentCandidateId: 'profile-1:tactic-1:provider-1',
    rollingScore: 0.75,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: '2026-03-01T00:00:00Z',
    recentTrend: 'stable',
    ...overrides,
  };
}

export function makeCandidateState(overrides: Partial<CandidatePerformanceState> = {}): CandidatePerformanceState {
  return {
    candidateId: 'profile-1:tactic-1:provider-1',
    familyKey: 'test-app:test-process:test-step',
    rollingScore: 0.8,
    runCount: 50,
    successRate: 0.9,
    averageLatency: 1200,
    lastSelectedAt: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

export function makeRankedCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  const candidate = overrides.candidate ?? makeCandidateState();
  return {
    candidate,
    compositeScore: 0.85,
    rank: 1,
    scoreBreakdown: {
      performanceComponent: 0.8,
      recencyComponent: 0.05,
      successRateComponent: 0.0,
    },
    ...overrides,
  };
}

export function makeAdaptationEvent(overrides: Partial<AdaptationEvent> = {}): AdaptationEvent {
  return {
    id: 'evt-1',
    familyKey: 'test-app:test-process:test-step',
    previousRanking: [makeRankedCandidate({ rank: 1 })],
    newRanking: [makeRankedCandidate({ rank: 1 })],
    trigger: 'scheduled' as AdaptationTrigger,
    evidenceSummary: 'Test evidence',
    mode: 'recommend_only' as AdaptiveMode,
    policyBoundsSnapshot: {
      explorationRate: 0.1,
      mode: 'recommend_only' as AdaptiveMode,
      additionalConstraints: {},
    },
    createdAt: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

export function makeRecommendation(overrides: Partial<AdaptationRecommendation> = {}): AdaptationRecommendation {
  return {
    id: 'rec-1',
    familyKey: 'test-app:test-process:test-step',
    recommendedRanking: [makeRankedCandidate()],
    evidence: 'Test evidence for recommendation',
    status: 'pending',
    createdAt: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

export function makeApproval(overrides: Partial<AdaptationApproval> = {}): AdaptationApproval {
  return {
    id: 'appr-1',
    familyKey: 'test-app:test-process:test-step',
    recommendationId: 'rec-1',
    status: 'pending' as AdaptationApprovalStatus,
    submittedAt: '2026-03-14T12:00:00Z',
    expiresAt: '2026-03-21T12:00:00Z',
    ...overrides,
  };
}

export function makeRankingSnapshot(overrides: Partial<RankingSnapshot> = {}): RankingSnapshot {
  return {
    familyKey: 'test-app:test-process:test-step',
    candidateRankings: [
      { candidateId: 'profile-1:tactic-1:provider-1', rank: 1, score: 0.85 },
    ],
    explorationRate: 0.1,
    capturedAt: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

export function makeRollbackRecord(overrides: Partial<AdaptationRollbackRecord> = {}): AdaptationRollbackRecord {
  return {
    id: 'rb-1',
    familyKey: 'test-app:test-process:test-step',
    targetAdaptationEventId: 'evt-1',
    previousSnapshot: makeRankingSnapshot(),
    restoredSnapshot: makeRankingSnapshot(),
    actor: 'test-operator',
    reason: 'Test rollback reason',
    rolledBackAt: '2026-03-14T13:00:00Z',
    ...overrides,
  };
}

export function makeExplorationConfig(overrides: Partial<ExplorationConfig> = {}): ExplorationConfig {
  return {
    baseRate: 0.1,
    decayFactor: 0.95,
    consequenceLevel: 'low',
    minimumRate: 0.01,
    maximumRate: 0.5,
    ...overrides,
  };
}

// ─── In-Memory Repository: OptimizerStateRepository ────────

export class InMemoryOptimizerStateRepository implements OptimizerStateRepository {
  public familyStates = new Map<string, FamilySelectionState>();
  public candidateStates = new Map<string, CandidatePerformanceState[]>();

  async getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined> {
    return this.familyStates.get(familyKey);
  }

  async saveFamilyState(state: FamilySelectionState): Promise<void> {
    this.familyStates.set(state.familyKey, state);
  }

  async getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]> {
    return this.candidateStates.get(familyKey) ?? [];
  }

  async saveCandidateState(state: CandidatePerformanceState): Promise<void> {
    const existing = this.candidateStates.get(state.familyKey) ?? [];
    const idx = existing.findIndex(c => c.candidateId === state.candidateId);
    if (idx >= 0) {
      existing[idx] = state;
    } else {
      existing.push(state);
    }
    this.candidateStates.set(state.familyKey, existing);
  }

  async listFamilies(): Promise<string[]> {
    return [...this.familyStates.keys()];
  }
}

// ─── In-Memory Repository: AdaptationLedgerWriter ──────────

export class InMemoryAdaptationLedger implements AdaptationLedgerWriter {
  public events: AdaptationEvent[] = [];

  async writeEvent(event: AdaptationEvent): Promise<void> {
    this.events.push(event);
  }

  async listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    let results = this.events.filter(e => e.familyKey === familyKey);
    if (filters?.trigger) {
      results = results.filter(e => e.trigger === filters.trigger);
    }
    if (filters?.since) {
      results = results.filter(e => e.createdAt >= filters.since!);
    }
    if (filters?.until) {
      results = results.filter(e => e.createdAt <= filters.until!);
    }
    if (filters?.limit) {
      results = results.slice(0, filters.limit);
    }
    return results;
  }

  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    return this.events.find(e => e.id === id);
  }
}

// ─── In-Memory Repository: AdaptationApprovalRepository ────

export class InMemoryApprovalRepository implements AdaptationApprovalRepository {
  public approvals: AdaptationApproval[] = [];

  async save(approval: AdaptationApproval): Promise<void> {
    this.approvals.push(approval);
  }

  async findById(id: string): Promise<AdaptationApproval | undefined> {
    return this.approvals.find(a => a.id === id);
  }

  async findPending(): Promise<AdaptationApproval[]> {
    return this.approvals.filter(a => a.status === 'pending');
  }

  async findByFamily(familyKey: string): Promise<AdaptationApproval[]> {
    return this.approvals.filter(a => a.familyKey === familyKey);
  }

  async updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void> {
    const approval = this.approvals.find(a => a.id === id);
    if (approval) {
      approval.status = status;
      if (fields?.decidedAt) approval.decidedAt = fields.decidedAt;
      if (fields?.decidedBy) approval.decidedBy = fields.decidedBy;
      if (fields?.reason) approval.reason = fields.reason;
    }
  }
}

// ─── In-Memory Repository: RollbackRecordWriter ────────────

export class InMemoryRollbackRecordWriter implements RollbackRecordWriter {
  public records: AdaptationRollbackRecord[] = [];

  async save(record: AdaptationRollbackRecord): Promise<void> {
    this.records.push(record);
  }
}

// ─── Collecting Audit Emitters ─────────────────────────────

export class CollectingApprovalAuditEmitter implements ApprovalAuditEmitter {
  public events: ApprovalAuditEvent[] = [];

  emit(event: ApprovalAuditEvent): void {
    this.events.push(event);
  }
}

export class CollectingRollbackAuditEmitter implements RollbackAuditEmitter {
  public events: RollbackAuditEvent[] = [];

  emit(event: RollbackAuditEvent): void {
    this.events.push(event);
  }
}

// ─── Mock Providers for LowRiskAutoApplyService ────────────

export class MockFamilyRiskProvider implements FamilyRiskProvider {
  constructor(private defaultLevel: FamilyRiskLevel = 'low') {}
  public overrides = new Map<string, FamilyRiskLevel>();

  async getRiskLevel(familyKey: string): Promise<FamilyRiskLevel> {
    return this.overrides.get(familyKey) ?? this.defaultLevel;
  }
}

export class MockFamilyPostureProvider implements FamilyPostureProvider {
  constructor(private defaultPosture: string = DecisionPosture.ADVISORY) {}
  public overrides = new Map<string, string>();

  async getPosture(familyKey: string): Promise<string> {
    return this.overrides.get(familyKey) ?? this.defaultPosture;
  }
}

export class MockRecentFailureCounter implements RecentFailureCounter {
  constructor(private defaultCount: number = 0) {}
  public overrides = new Map<string, number>();

  async countRecentFailures(familyKey: string): Promise<number> {
    return this.overrides.get(familyKey) ?? this.defaultCount;
  }
}

export class CollectingAutoApplyDecisionWriter implements AutoApplyDecisionWriter {
  public decisions: AutoApplyDecisionRecord[] = [];

  async save(record: AutoApplyDecisionRecord): Promise<void> {
    this.decisions.push(record);
  }
}
