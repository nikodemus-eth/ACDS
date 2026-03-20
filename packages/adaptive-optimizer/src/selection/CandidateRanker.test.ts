import { describe, it, expect } from 'vitest';
import { rankCandidates } from './CandidateRanker.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';

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

function makeFamilyState(overrides: Partial<FamilySelectionState> = {}): FamilySelectionState {
  return {
    familyKey: 'fam:test',
    currentCandidateId: 'model:tactic:provider',
    rollingScore: 0.8,
    explorationRate: 0.0,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
    ...overrides,
  };
}

describe('rankCandidates', () => {
  const familyState = makeFamilyState();

  it('returns empty array for empty candidates', () => {
    const result = rankCandidates([], familyState);
    expect(result).toEqual([]);
  });

  it('ranks a single candidate at rank 1', () => {
    const candidates = [makeCandidate({ candidateId: 'a:a:a' })];
    const result = rankCandidates(candidates, familyState);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].candidate.candidateId).toBe('a:a:a');
    expect(result[0].compositeScore).toBeGreaterThan(0);
  });

  it('ranks multiple candidates by composite score descending', () => {
    const candidates = [
      makeCandidate({ candidateId: 'low:l:l', rollingScore: 0.3, successRate: 0.5 }),
      makeCandidate({ candidateId: 'high:h:h', rollingScore: 0.9, successRate: 0.99 }),
      makeCandidate({ candidateId: 'mid:m:m', rollingScore: 0.6, successRate: 0.8 }),
    ];
    const result = rankCandidates(candidates, familyState);
    expect(result[0].candidate.candidateId).toBe('high:h:h');
    expect(result[1].candidate.candidateId).toBe('mid:m:m');
    expect(result[2].candidate.candidateId).toBe('low:l:l');

    // Verify descending composite scores
    for (let i = 1; i < result.length; i++) {
      expect(result[i].compositeScore).toBeLessThanOrEqual(result[i - 1].compositeScore);
    }
  });

  it('assigns correct ranks (1-based)', () => {
    const candidates = [
      makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.5 }),
      makeCandidate({ candidateId: 'b:b:b', rollingScore: 0.9 }),
    ];
    const result = rankCandidates(candidates, familyState);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('includes correct score breakdown', () => {
    const now = new Date().toISOString();
    const candidates = [makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.8, successRate: 0.9, lastSelectedAt: now })];
    const result = rankCandidates(candidates, familyState);
    const breakdown = result[0].scoreBreakdown;

    expect(breakdown.performanceComponent).toBe(0.8);
    expect(breakdown.successRateComponent).toBe(0.9);
    // Recency should be close to 1.0 since lastSelectedAt is now
    expect(breakdown.recencyComponent).toBeCloseTo(1.0, 1);
  });

  it('applies recency decay for old candidates', () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const recentDate = new Date().toISOString();
    const candidates = [
      makeCandidate({ candidateId: 'old:o:o', rollingScore: 0.8, successRate: 0.9, lastSelectedAt: oldDate }),
      makeCandidate({ candidateId: 'new:n:n', rollingScore: 0.8, successRate: 0.9, lastSelectedAt: recentDate }),
    ];
    const result = rankCandidates(candidates, familyState);

    // The recent candidate should have higher recency bonus
    const oldEntry = result.find(r => r.candidate.candidateId === 'old:o:o')!;
    const newEntry = result.find(r => r.candidate.candidateId === 'new:n:n')!;
    expect(newEntry.scoreBreakdown.recencyComponent).toBeGreaterThan(oldEntry.scoreBreakdown.recencyComponent);
  });

  it('gives recency bonus of 1.0 for future lastSelectedAt', () => {
    const futureDate = new Date(Date.now() + 100_000).toISOString();
    const candidates = [makeCandidate({ candidateId: 'f:f:f', lastSelectedAt: futureDate })];
    const result = rankCandidates(candidates, familyState);
    expect(result[0].scoreBreakdown.recencyComponent).toBe(1.0);
  });

  describe('custom weights', () => {
    it('uses custom performanceWeight', () => {
      const candidates = [
        makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.9, successRate: 0.5 }),
        makeCandidate({ candidateId: 'b:b:b', rollingScore: 0.5, successRate: 0.9 }),
      ];
      // Heavy performance weight should favor candidate A
      const result = rankCandidates(candidates, familyState, {
        performanceWeight: 0.9,
        successRateWeight: 0.05,
        recencyWeight: 0.05,
      });
      expect(result[0].candidate.candidateId).toBe('a:a:a');
    });

    it('uses custom successRateWeight', () => {
      const candidates = [
        makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.5, successRate: 0.9 }),
        makeCandidate({ candidateId: 'b:b:b', rollingScore: 0.9, successRate: 0.5 }),
      ];
      // Heavy success rate weight should favor candidate A
      const result = rankCandidates(candidates, familyState, {
        performanceWeight: 0.05,
        successRateWeight: 0.9,
        recencyWeight: 0.05,
      });
      expect(result[0].candidate.candidateId).toBe('a:a:a');
    });

    it('uses custom recencyHalfLifeMs', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const candidates = [makeCandidate({ candidateId: 'a:a:a', lastSelectedAt: oneHourAgo })];

      // With very short half-life, recency bonus should be very low
      const shortHalfLife = rankCandidates(candidates, familyState, { recencyHalfLifeMs: 1000 });
      // With very long half-life, recency bonus should be close to 1
      const longHalfLife = rankCandidates(candidates, familyState, { recencyHalfLifeMs: 1e12 });

      expect(longHalfLife[0].scoreBreakdown.recencyComponent).toBeGreaterThan(
        shortHalfLife[0].scoreBreakdown.recencyComponent,
      );
    });
  });

  it('computes composite score as weighted sum of components', () => {
    const now = new Date().toISOString();
    const candidates = [makeCandidate({ candidateId: 'a:a:a', rollingScore: 0.7, successRate: 0.8, lastSelectedAt: now })];
    const result = rankCandidates(candidates, familyState);
    const bd = result[0].scoreBreakdown;
    const expected = 0.6 * bd.performanceComponent + 0.15 * bd.recencyComponent + 0.25 * bd.successRateComponent;
    expect(result[0].compositeScore).toBeCloseTo(expected, 10);
  });
});
