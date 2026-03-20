import { describe, it, expect } from 'vitest';
import { TriageRanker } from './TriageRanker.js';
import { TaskType, LoadTier, CognitiveGrade, ProviderVendor } from '@acds/core-types';
import type { ModelProfile, CandidateEvaluation } from '@acds/core-types';

const now = new Date();

function makeProfile(id: string, overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id,
    name: `profile_${id}`,
    description: '',
    vendor: ProviderVendor.OLLAMA,
    modelId: `model_${id}`,
    supportedTaskTypes: Object.values(TaskType),
    supportedLoadTiers: Object.values(LoadTier),
    minimumCognitiveGrade: CognitiveGrade.BASIC,
    contextWindow: 32768,
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    localOnly: true,
    cloudAllowed: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TriageRanker', () => {
  const ranker = new TriageRanker();

  it('ranks cheapest profile first', () => {
    const profiles = [
      makeProfile('expensive', { costPer1kInput: 0.01, costPer1kOutput: 0.03 }),
      makeProfile('cheap', { costPer1kInput: 0, costPer1kOutput: 0 }),
    ];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'expensive', eligible: true, rejectionReason: null },
      { providerId: '', modelProfileId: 'cheap', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map([['expensive', 'prov-1'], ['cheap', 'prov-2']]);

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked[0].profileId).toBe('cheap');
    expect(ranked[1].profileId).toBe('expensive');
  });

  it('uses context window as tiebreaker', () => {
    const profiles = [
      makeProfile('big', { contextWindow: 128000, costPer1kInput: 0, costPer1kOutput: 0 }),
      makeProfile('small', { contextWindow: 4096, costPer1kInput: 0, costPer1kOutput: 0 }),
    ];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'big', eligible: true, rejectionReason: null },
      { providerId: '', modelProfileId: 'small', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map([['big', 'prov-1'], ['small', 'prov-2']]);

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked[0].profileId).toBe('small');
  });

  it('excludes ineligible candidates', () => {
    const profiles = [makeProfile('p1'), makeProfile('p2')];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'p1', eligible: false, rejectionReason: 'disabled' },
      { providerId: '', modelProfileId: 'p2', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map([['p1', 'prov-1'], ['p2', 'prov-2']]);

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].profileId).toBe('p2');
  });

  it('returns empty array when no eligible candidates', () => {
    const profiles = [makeProfile('p1')];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'p1', eligible: false, rejectionReason: 'disabled' },
    ];
    const providerMap = new Map([['p1', 'prov-1']]);

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked).toHaveLength(0);
  });

  it('skips candidates with no matching profile in map', () => {
    const profiles = [makeProfile('p1')];
    // Evaluation references 'p2' which has no profile in the profiles array
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'p1', eligible: true, rejectionReason: null },
      { providerId: '', modelProfileId: 'p2', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map([['p1', 'prov-1'], ['p2', 'prov-2']]);

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].profileId).toBe('p1');
  });

  it('handles candidates with no provider mapping', () => {
    const profiles = [makeProfile('p1')];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'p1', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map<string, string>(); // empty map

    const ranked = ranker.rank(evaluations, profiles, providerMap);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].providerId).toBe('');
  });

  it('is deterministic — same input produces same output', () => {
    const profiles = [
      makeProfile('a', { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 4096 }),
      makeProfile('b', { costPer1kInput: 0, costPer1kOutput: 0, contextWindow: 4096 }),
    ];
    const evaluations: CandidateEvaluation[] = [
      { providerId: '', modelProfileId: 'a', eligible: true, rejectionReason: null },
      { providerId: '', modelProfileId: 'b', eligible: true, rejectionReason: null },
    ];
    const providerMap = new Map([['a', 'prov-1'], ['b', 'prov-2']]);

    const results = Array.from({ length: 20 }, () => ranker.rank(evaluations, profiles, providerMap));
    const firstResult = results[0];
    for (const result of results) {
      expect(result).toEqual(firstResult);
    }
  });
});
