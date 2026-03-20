import { describe, it, expect } from 'vitest';
import { FallbackChainBuilder } from './FallbackChainBuilder.js';
import { CognitiveGrade, LoadTier, ProviderVendor, TaskType } from '@acds/core-types';
import type { ModelProfile } from '@acds/core-types';

const now = new Date('2026-03-15T10:00:00Z');

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
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
    ...overrides,
  };
}

describe('FallbackChainBuilder', () => {
  const builder = new FallbackChainBuilder();

  it('builds an empty chain when only the selected profile is eligible', () => {
    const eligible = [makeProfile('p1')];
    const providerMap = new Map([['p1', 'prov-1']]);
    const chain = builder.build(eligible, 'p1', 'tac-1', providerMap);
    expect(chain).toHaveLength(0);
  });

  it('builds a chain from remaining eligible profiles', () => {
    const eligible = [makeProfile('p1'), makeProfile('p2'), makeProfile('p3')];
    const providerMap = new Map([
      ['p1', 'prov-1'],
      ['p2', 'prov-2'],
      ['p3', 'prov-3'],
    ]);
    const chain = builder.build(eligible, 'p1', 'tac-1', providerMap);

    expect(chain).toHaveLength(2);
    expect(chain[0].modelProfileId).toBe('p2');
    expect(chain[0].tacticProfileId).toBe('tac-1');
    expect(chain[0].providerId).toBe('prov-2');
    expect(chain[0].priority).toBe(1);
    expect(chain[1].modelProfileId).toBe('p3');
    expect(chain[1].priority).toBe(2);
  });

  it('skips profiles without a mapped provider', () => {
    const eligible = [makeProfile('p1'), makeProfile('p2'), makeProfile('p3')];
    const providerMap = new Map([
      ['p1', 'prov-1'],
      // p2 has no provider
      ['p3', 'prov-3'],
    ]);
    const chain = builder.build(eligible, 'p1', 'tac-1', providerMap);

    expect(chain).toHaveLength(1);
    expect(chain[0].modelProfileId).toBe('p3');
    expect(chain[0].priority).toBe(1);
  });

  it('returns an empty chain when no eligible profiles remain', () => {
    const chain = builder.build([], 'p1', 'tac-1', new Map());
    expect(chain).toHaveLength(0);
  });

  it('uses the selected tactic for all fallback entries', () => {
    const eligible = [makeProfile('p1'), makeProfile('p2')];
    const providerMap = new Map([['p1', 'prov-1'], ['p2', 'prov-2']]);
    const chain = builder.build(eligible, 'p1', 'custom-tactic', providerMap);

    expect(chain).toHaveLength(1);
    expect(chain[0].tacticProfileId).toBe('custom-tactic');
  });

  it('assigns sequential priorities', () => {
    const eligible = [
      makeProfile('p1'),
      makeProfile('p2'),
      makeProfile('p3'),
      makeProfile('p4'),
    ];
    const providerMap = new Map([
      ['p1', 'prov-1'],
      ['p2', 'prov-2'],
      ['p3', 'prov-3'],
      ['p4', 'prov-4'],
    ]);
    const chain = builder.build(eligible, 'p1', 'tac-1', providerMap);

    expect(chain.map((e) => e.priority)).toEqual([1, 2, 3]);
  });
});
