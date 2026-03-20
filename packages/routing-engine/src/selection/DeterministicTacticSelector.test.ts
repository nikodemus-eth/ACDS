import { describe, it, expect } from 'vitest';
import { DeterministicTacticSelector } from './DeterministicTacticSelector.js';
import { LoadTier, TaskType } from '@acds/core-types';
import type { TacticProfile } from '@acds/core-types';
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

describe('DeterministicTacticSelector', () => {
  const selector = new DeterministicTacticSelector();

  it('returns null when no eligible tactics', () => {
    const result = selector.select([], makePolicy());
    expect(result).toBeNull();
  });

  it('prefers the policy default tactic when eligible', () => {
    const tactics = [makeTactic('t1'), makeTactic('t2')];
    const result = selector.select(tactics, makePolicy({ defaultTacticProfileId: 't2' }));
    expect(result!.id).toBe('t2');
  });

  it('ignores the policy default tactic when not in eligible list', () => {
    const tactics = [makeTactic('t1'), makeTactic('t2')];
    const result = selector.select(tactics, makePolicy({ defaultTacticProfileId: 't99' }));
    // Falls through to single-stage preference
    expect(result!.id).toBe('t1');
  });

  it('prefers single-stage tactics over multi-stage', () => {
    const tactics = [
      makeTactic('multi', { multiStage: true }),
      makeTactic('single', { multiStage: false }),
    ];
    const result = selector.select(tactics, makePolicy());
    expect(result!.id).toBe('single');
  });

  it('returns first tactic when all are multi-stage', () => {
    const tactics = [
      makeTactic('multi1', { multiStage: true }),
      makeTactic('multi2', { multiStage: true }),
    ];
    const result = selector.select(tactics, makePolicy());
    expect(result!.id).toBe('multi1');
  });

  it('policy default takes priority over single-stage preference', () => {
    const tactics = [
      makeTactic('single', { multiStage: false }),
      makeTactic('multi', { multiStage: true }),
    ];
    const result = selector.select(
      tactics,
      makePolicy({ defaultTacticProfileId: 'multi' }),
    );
    expect(result!.id).toBe('multi');
  });

  it('returns the only tactic when just one is eligible', () => {
    const tactics = [makeTactic('only')];
    const result = selector.select(tactics, makePolicy());
    expect(result!.id).toBe('only');
  });
});
