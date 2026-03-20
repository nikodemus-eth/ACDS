import { describe, it, expect } from 'vitest';
import { ExecutionRationaleBuilder } from './ExecutionRationaleBuilder.js';
import {
  CognitiveGrade,
  DecisionPosture,
  LoadTier,
  ProviderVendor,
  TaskType,
} from '@acds/core-types';
import type { ModelProfile, TacticProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';

const now = new Date('2026-03-15T10:00:00Z');

function makeProfile(id: string): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: 'test',
    vendor: ProviderVendor.OPENAI,
    modelId: `model_${id}`,
    supportedTaskTypes: [TaskType.ANALYTICAL],
    supportedLoadTiers: [LoadTier.SINGLE_SHOT],
    minimumCognitiveGrade: CognitiveGrade.STANDARD,
    contextWindow: 8192,
    maxTokens: 2048,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTactic(id: string): TacticProfile {
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
  };
}

function makeRequest(): RoutingRequest {
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

describe('ExecutionRationaleBuilder', () => {
  const builder = new ExecutionRationaleBuilder();

  it('builds a rationale with all fields populated', () => {
    const rationale = builder.build(
      'decision-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy(),
      3,
      2,
    );

    expect(rationale.id).toBeDefined();
    expect(rationale.id).toHaveLength(36); // UUID
    expect(rationale.routingDecisionId).toBe('decision-1');
    expect(rationale.eligibleProfileCount).toBe(3);
    expect(rationale.eligibleTacticCount).toBe(2);
    expect(rationale.createdAt).toBeInstanceOf(Date);
  });

  it('builds the execution family key from request fields', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy(),
      1,
      1,
    );

    expect(rationale.executionFamilyKey).toBe(
      'TestApp.Review.Analyze.operational.standard',
    );
  });

  it('includes profile name in selectedProfileReason', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy(),
      1,
      1,
    );

    expect(rationale.selectedProfileReason).toContain('profile_p1');
    expect(rationale.selectedProfileReason).toContain(TaskType.ANALYTICAL);
    expect(rationale.selectedProfileReason).toContain(LoadTier.SINGLE_SHOT);
    expect(rationale.selectedProfileReason).toContain(CognitiveGrade.STANDARD);
  });

  it('includes tactic name and method in selectedTacticReason', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy(),
      1,
      1,
    );

    expect(rationale.selectedTacticReason).toContain('tactic_t1');
    expect(rationale.selectedTacticReason).toContain('single_pass');
  });

  it('includes provider ID in selectedProviderReason', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy(),
      1,
      1,
    );

    expect(rationale.selectedProviderReason).toContain('prov-1');
    expect(rationale.selectedProviderReason).toContain('profile_p1');
  });

  it('includes policy details in policyMatchSummary', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy({ privacy: 'local_only', costSensitivity: 'low', forceEscalation: true }),
      1,
      1,
    );

    expect(rationale.policyMatchSummary).toContain('local_only');
    expect(rationale.policyMatchSummary).toContain('low');
    expect(rationale.policyMatchSummary).toContain('true');
  });

  it('includes constraint details in constraintsSummary', () => {
    const rationale = builder.build(
      'dec-1',
      makeRequest(),
      makeProfile('p1'),
      makeTactic('t1'),
      'prov-1',
      makePolicy({ structuredOutputRequired: true, traceabilityRequired: true }),
      1,
      1,
    );

    expect(rationale.constraintsSummary).toContain('true');
  });

  it('generates unique IDs for each invocation', () => {
    const r1 = builder.build('d1', makeRequest(), makeProfile('p1'), makeTactic('t1'), 'prov-1', makePolicy(), 1, 1);
    const r2 = builder.build('d2', makeRequest(), makeProfile('p1'), makeTactic('t1'), 'prov-1', makePolicy(), 1, 1);
    expect(r1.id).not.toBe(r2.id);
  });
});
