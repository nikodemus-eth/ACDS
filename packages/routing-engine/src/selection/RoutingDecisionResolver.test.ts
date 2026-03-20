import { describe, it, expect } from 'vitest';
import { RoutingDecisionResolver } from './RoutingDecisionResolver.js';
import { CognitiveGrade, LoadTier, ProviderVendor, TaskType } from '@acds/core-types';
import type { ModelProfile, TacticProfile, FallbackEntry } from '@acds/core-types';

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

describe('RoutingDecisionResolver', () => {
  const resolver = new RoutingDecisionResolver();

  it('resolves a routing decision with all fields populated', () => {
    const profile = makeProfile('p1');
    const tactic = makeTactic('t1');
    const fallbackChain: FallbackEntry[] = [];

    const decision = resolver.resolve(
      profile, tactic, 'prov-1', fallbackChain, 'rationale-1', 'summary text',
    );

    expect(decision.id).toBeDefined();
    expect(decision.id).toHaveLength(36); // UUID format
    expect(decision.selectedModelProfileId).toBe('p1');
    expect(decision.selectedTacticProfileId).toBe('t1');
    expect(decision.selectedProviderId).toBe('prov-1');
    expect(decision.fallbackChain).toEqual([]);
    expect(decision.rationaleId).toBe('rationale-1');
    expect(decision.rationaleSummary).toBe('summary text');
    expect(decision.resolvedAt).toBeInstanceOf(Date);
  });

  it('includes fallback chain entries in the decision', () => {
    const profile = makeProfile('p1');
    const tactic = makeTactic('t1');
    const fallbackChain: FallbackEntry[] = [
      { modelProfileId: 'p2', tacticProfileId: 't1', providerId: 'prov-2', priority: 1 },
      { modelProfileId: 'p3', tacticProfileId: 't1', providerId: 'prov-3', priority: 2 },
    ];

    const decision = resolver.resolve(
      profile, tactic, 'prov-1', fallbackChain, 'rationale-1', 'summary',
    );

    expect(decision.fallbackChain).toHaveLength(2);
    expect(decision.fallbackChain[0].modelProfileId).toBe('p2');
    expect(decision.fallbackChain[1].modelProfileId).toBe('p3');
  });

  it('generates unique IDs for each call', () => {
    const profile = makeProfile('p1');
    const tactic = makeTactic('t1');

    const d1 = resolver.resolve(profile, tactic, 'prov-1', [], 'r1', 's1');
    const d2 = resolver.resolve(profile, tactic, 'prov-1', [], 'r2', 's2');

    expect(d1.id).not.toBe(d2.id);
  });

  it('resolvedAt is close to current time', () => {
    const profile = makeProfile('p1');
    const tactic = makeTactic('t1');

    const before = Date.now();
    const decision = resolver.resolve(profile, tactic, 'prov-1', [], 'r1', 's1');
    const after = Date.now();

    expect(decision.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(decision.resolvedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
