import { describe, it, expect } from 'vitest';
import { EligibleTacticsService } from './EligibleTacticsService.js';
import {
  CognitiveGrade,
  DecisionPosture,
  LoadTier,
  TaskType,
} from '@acds/core-types';
import type { TacticProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

const now = new Date('2026-03-15T10:00:00Z');

function makeTactic(id: string, overrides: Partial<TacticProfile> = {}): TacticProfile {
  return {
    id,
    name: `tactic_${id}`,
    description: 'test tactic',
    executionMethod: 'single_pass',
    systemPromptTemplate: '',
    outputSchema: undefined,
    maxRetries: 0,
    temperature: 0,
    topP: 1,
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    application: 'TestApp',
    process: 'Review',
    step: 'Analyze',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

function makePolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    allowedVendors: [],
    blockedVendors: [],
    privacy: 'cloud_allowed',
    costSensitivity: 'medium',
    structuredOutputRequired: false,
    traceabilityRequired: false,
    maxLatencyMs: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: [],
    allowedTacticProfileIds: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    forceEscalation: false,
    ...overrides,
  };
}

describe('EligibleTacticsService', () => {
  const service = new EligibleTacticsService();

  it('returns eligible tactics that match all criteria', () => {
    const tactics = [makeTactic('t1'), makeTactic('t2')];
    const result = service.computeEligible(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(2);
  });

  it('filters out disabled tactics', () => {
    const tactics = [makeTactic('t1', { enabled: false })];
    const result = service.computeEligible(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters by tactic allowlist when set', () => {
    const tactics = [makeTactic('t1'), makeTactic('t2')];
    const result = service.computeEligible(
      tactics,
      makePolicy({ allowedTacticProfileIds: ['t2'] }),
      makeRequest(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t2');
  });

  it('filters out tactics that do not support the task type', () => {
    const tactics = [makeTactic('t1', { supportedTaskTypes: [TaskType.CODING] })];
    const result = service.computeEligible(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters out tactics that do not support the load tier', () => {
    const tactics = [makeTactic('t1', { supportedLoadTiers: [LoadTier.BATCH] })];
    const result = service.computeEligible(tactics, makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });

  it('filters out tactics without structured output when policy requires it', () => {
    const tactics = [makeTactic('t1', { requiresStructuredOutput: false })];
    const result = service.computeEligible(
      tactics,
      makePolicy({ structuredOutputRequired: true }),
      makeRequest(),
    );
    expect(result).toHaveLength(0);
  });

  it('keeps tactics with structured output when policy requires it', () => {
    const tactics = [makeTactic('t1', { requiresStructuredOutput: true })];
    const result = service.computeEligible(
      tactics,
      makePolicy({ structuredOutputRequired: true }),
      makeRequest(),
    );
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no tactics are provided', () => {
    const result = service.computeEligible([], makePolicy(), makeRequest());
    expect(result).toHaveLength(0);
  });
});
