import { describe, it, expect } from 'vitest';
import { buildAdaptationEvent, type BuildAdaptationEventParams } from './AdaptationEventBuilder.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';

function makeCandidate(overrides: Partial<CandidatePerformanceState> = {}): CandidatePerformanceState {
  return {
    candidateId: 'model:tactic:provider',
    familyKey: 'fam:test',
    rollingScore: 0.8,
    runCount: 100,
    successRate: 0.95,
    averageLatency: 200,
    lastSelectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRanked(candidateId: string, score: number, rank: number): RankedCandidate {
  return {
    candidate: makeCandidate({ candidateId }),
    compositeScore: score,
    rank,
    scoreBreakdown: {
      performanceComponent: score * 0.6,
      recencyComponent: score * 0.15,
      successRateComponent: score * 0.25,
    },
  };
}

describe('buildAdaptationEvent', () => {
  const baseParams: BuildAdaptationEventParams = {
    id: 'evt-1',
    familyKey: 'fam:test',
    previousRanking: [makeRanked('a:a:a', 0.9, 1)],
    newRanking: [makeRanked('b:b:b', 0.95, 1)],
    trigger: 'scheduled',
    evidenceSummary: 'Scheduled re-evaluation.',
    mode: 'fully_applied',
    policyBoundsSnapshot: {
      explorationRate: 0.1,
      mode: 'fully_applied',
      additionalConstraints: {},
    },
  };

  it('returns an AdaptationEvent with all provided fields', () => {
    const event = buildAdaptationEvent(baseParams);
    expect(event.id).toBe('evt-1');
    expect(event.familyKey).toBe('fam:test');
    expect(event.previousRanking).toEqual(baseParams.previousRanking);
    expect(event.newRanking).toEqual(baseParams.newRanking);
    expect(event.trigger).toBe('scheduled');
    expect(event.evidenceSummary).toBe('Scheduled re-evaluation.');
    expect(event.mode).toBe('fully_applied');
    expect(event.policyBoundsSnapshot).toEqual(baseParams.policyBoundsSnapshot);
  });

  it('sets createdAt to a valid ISO timestamp', () => {
    const event = buildAdaptationEvent(baseParams);
    expect(event.createdAt).toBeTruthy();
    const ts = new Date(event.createdAt).getTime();
    expect(ts).not.toBeNaN();
    // Should be very recent
    expect(Math.abs(Date.now() - ts)).toBeLessThan(2000);
  });

  it('works with all trigger types', () => {
    for (const trigger of ['scheduled', 'plateau', 'manual'] as const) {
      const event = buildAdaptationEvent({ ...baseParams, trigger });
      expect(event.trigger).toBe(trigger);
    }
  });

  it('works with all mode types', () => {
    for (const mode of ['observe_only', 'recommend_only', 'auto_apply_low_risk', 'fully_applied'] as const) {
      const event = buildAdaptationEvent({ ...baseParams, mode });
      expect(event.mode).toBe(mode);
    }
  });

  it('preserves empty rankings', () => {
    const event = buildAdaptationEvent({ ...baseParams, previousRanking: [], newRanking: [] });
    expect(event.previousRanking).toEqual([]);
    expect(event.newRanking).toEqual([]);
  });

  it('preserves policyBoundsSnapshot with additionalConstraints', () => {
    const event = buildAdaptationEvent({
      ...baseParams,
      policyBoundsSnapshot: {
        explorationRate: 0.2,
        mode: 'recommend_only',
        additionalConstraints: { maxCost: 100, region: 'us-east' },
      },
    });
    expect(event.policyBoundsSnapshot.additionalConstraints).toEqual({ maxCost: 100, region: 'us-east' });
  });
});
