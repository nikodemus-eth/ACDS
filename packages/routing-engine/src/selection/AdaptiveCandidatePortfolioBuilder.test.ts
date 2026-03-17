import { describe, it, expect } from 'vitest';
import { buildCandidatePortfolio, type PortfolioBuildInputs } from './AdaptiveCandidatePortfolioBuilder.js';
import { buildCandidateId } from '@acds/adaptive-optimizer';

const now = new Date('2026-03-15T10:00:00Z');

function makeProfile(id: string) {
  return {
    id,
    name: `profile_${id}`,
    description: 'test',
    vendor: 'openai',
    modelId: id,
    supportedTaskTypes: [],
    supportedLoadTiers: [],
    minimumCognitiveGrade: 'standard',
    contextWindow: 8192,
    maxTokens: 2048,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    localOnly: false,
    cloudAllowed: true,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTactic(id: string) {
  return {
    id,
    name: `tactic_${id}`,
    description: 'test',
    executionMethod: 'single_pass',
    systemPromptTemplate: '',
    outputSchema: undefined,
    maxRetries: 0,
    temperature: 0,
    topP: 1,
    supportedTaskTypes: [],
    supportedLoadTiers: [],
    multiStage: false,
    requiresStructuredOutput: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe('buildCandidatePortfolio', () => {
  it('creates candidates for all profile+tactic+provider combinations', () => {
    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [makeProfile('p1'), makeProfile('p2')] as any[],
      eligibleTactics: [makeTactic('t1'), makeTactic('t2')] as any[],
      profileProviderMap: new Map([['p1', 'prov-1'], ['p2', 'prov-2']]),
      existingCandidateStates: [],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(4); // 2 profiles * 2 tactics
  });

  it('sets default values for new candidates', () => {
    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [makeProfile('p1')] as any[],
      eligibleTactics: [makeTactic('t1')] as any[],
      profileProviderMap: new Map([['p1', 'prov-1']]),
      existingCandidateStates: [],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(1);
    expect(result[0].rollingScore).toBe(0.5);
    expect(result[0].successRate).toBe(1.0);
    expect(result[0].runCount).toBe(0);
    expect(result[0].averageLatency).toBe(0);
    expect(result[0].familyKey).toBe('app:proc:step');
  });

  it('merges existing candidate state when available', () => {
    const candidateId = buildCandidateId('p1', 't1', 'prov-1');
    const existingState = {
      candidateId,
      familyKey: 'app:proc:step',
      rollingScore: 0.9,
      runCount: 50,
      successRate: 0.95,
      averageLatency: 150,
      lastSelectedAt: '2026-03-15T09:00:00.000Z',
    };

    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [makeProfile('p1')] as any[],
      eligibleTactics: [makeTactic('t1')] as any[],
      profileProviderMap: new Map([['p1', 'prov-1']]),
      existingCandidateStates: [existingState],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(1);
    expect(result[0].rollingScore).toBe(0.9);
    expect(result[0].runCount).toBe(50);
  });

  it('skips profiles without a mapped provider', () => {
    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [makeProfile('p1'), makeProfile('p2')] as any[],
      eligibleTactics: [makeTactic('t1')] as any[],
      profileProviderMap: new Map([['p1', 'prov-1']]), // p2 has no provider
      existingCandidateStates: [],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no eligible profiles', () => {
    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [],
      eligibleTactics: [makeTactic('t1')] as any[],
      profileProviderMap: new Map(),
      existingCandidateStates: [],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no eligible tactics', () => {
    const inputs: PortfolioBuildInputs = {
      familyKey: 'app:proc:step',
      eligibleProfiles: [makeProfile('p1')] as any[],
      eligibleTactics: [],
      profileProviderMap: new Map([['p1', 'prov-1']]),
      existingCandidateStates: [],
    };

    const result = buildCandidatePortfolio(inputs);
    expect(result).toHaveLength(0);
  });
});
