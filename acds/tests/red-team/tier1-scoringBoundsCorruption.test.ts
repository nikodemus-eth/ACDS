/**
 * ARGUS-9 Tier 1 — Scoring Bounds & Corruption
 *
 * Tests that ExecutionScoreCalculator and CandidateRanker accept
 * out-of-bounds values that corrupt scoring and ranking.
 */

import { describe, it, expect } from 'vitest';
import { calculateExecutionScore } from '@acds/evaluation';
import {
  rankCandidates,
  parseCandidateId,
  buildCandidateId,
} from '@acds/adaptive-optimizer';
import { makeFamilyState, makeCandidateState } from './_fixtures.js';

describe('ARGUS F1-F3: Scoring Bounds Corruption', () => {

  describe('calculateExecutionScore', () => {

    it('accepts metric score > 1.0 producing inflated composite', () => {
      // VULN: no bounds checking — scores documented as "0 to 1" but nothing enforces it
      const result = calculateExecutionScore([
        { score: 5.0, label: 'acceptance', details: {} },
        { score: 1.0, label: 'latency', details: {} },
      ]);
      expect(result.compositeScore).toBeGreaterThan(1.0);
    });

    it('accepts negative metric score producing negative composite', () => {
      // VULN: negative scores corrupt weighted average
      const result = calculateExecutionScore([
        { score: -3.0, label: 'acceptance', details: {} },
        { score: 1.0, label: 'latency', details: {} },
      ]);
      expect(result.compositeScore).toBeLessThan(0);
    });

    it('silently converts NaN weight to zero composite via totalWeight guard', () => {
      // VULN: NaN weight → totalWeight=NaN → NaN>0 is false → resolvedWeight=0 → composite=0
      // A NaN weight should be an error, but instead silently produces 0
      const result = calculateExecutionScore(
        [{ score: 0.8, label: 'acceptance', details: {} }],
        { acceptance: NaN },
      );
      expect(result.compositeScore).toBe(0);
      expect(result.resolvedWeights.acceptance).toBe(0);
    });

    it('produces NaN composite with Infinity weight', () => {
      // VULN: Infinity in weight normalization produces NaN (Infinity/Infinity)
      const result = calculateExecutionScore(
        [
          { score: 0.8, label: 'acceptance', details: {} },
          { score: 0.5, label: 'latency', details: {} },
        ],
        { acceptance: Infinity, latency: 1 },
      );
      // Infinity / (Infinity + 1) = NaN
      expect(Number.isNaN(result.compositeScore) || !Number.isFinite(result.compositeScore)).toBe(true);
    });

    it('produces 0 composite with all-zero weights', () => {
      // VULN: totalWeight=0 triggers division guard but produces 0 for all weights
      const result = calculateExecutionScore(
        [{ score: 0.8, label: 'acceptance', details: {} }],
        { acceptance: 0 },
      );
      expect(result.compositeScore).toBe(0);
    });

    it('accepts negative weights inverting metric contribution', () => {
      // VULN: negative weights make high scores reduce the composite
      const result = calculateExecutionScore(
        [
          { score: 1.0, label: 'good_metric', details: {} },
          { score: 0.5, label: 'bad_metric', details: {} },
        ],
        { good_metric: -1, bad_metric: 1 },
      );
      // With negative weights, normalization produces unexpected results
      expect(result.compositeScore).not.toBeGreaterThan(1.0);
    });
  });

  describe('rankCandidates — score corruption', () => {
    const familyState = makeFamilyState();

    it('produces inflated ranking from rollingScore > 1.0', () => {
      // VULN: no bounds validation on candidate performance state
      const candidates = [
        makeCandidateState({ candidateId: 'a:b:c', rollingScore: 5.0, successRate: 0.9 }),
        makeCandidateState({ candidateId: 'd:e:f', rollingScore: 0.8, successRate: 0.9 }),
      ];
      const ranked = rankCandidates(candidates, familyState);
      expect(ranked[0].compositeScore).toBeGreaterThan(1.0);
    });

    it('produces corrupted ranking from successRate > 1.0', () => {
      // VULN: successRate should be 0-1 but nothing enforces this
      const candidates = [
        makeCandidateState({ candidateId: 'a:b:c', rollingScore: 0.5, successRate: 2.0 }),
        makeCandidateState({ candidateId: 'd:e:f', rollingScore: 0.9, successRate: 0.5 }),
      ];
      const ranked = rankCandidates(candidates, familyState);
      // The candidate with inflated successRate may rank higher
      expect(ranked[0].candidate.candidateId).toBe('a:b:c');
    });

    it('produces maximum recency bonus from future lastSelectedAt', () => {
      // VULN: future dates produce recency bonus > 1.0 via negative elapsed time
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const candidates = [
        makeCandidateState({
          candidateId: 'a:b:c',
          rollingScore: 0.5,
          successRate: 0.5,
          lastSelectedAt: futureDate,
        }),
        makeCandidateState({
          candidateId: 'd:e:f',
          rollingScore: 0.5,
          successRate: 0.5,
          lastSelectedAt: '2025-01-01T00:00:00Z',
        }),
      ];
      const ranked = rankCandidates(candidates, familyState);
      // Future date candidate gets recency = 1.0 (clamped at 0 elapsed)
      expect(ranked[0].candidate.candidateId).toBe('a:b:c');
      expect(ranked[0].scoreBreakdown.recencyComponent).toBe(1.0);
    });
  });

  describe('parseCandidateId — injection', () => {

    it('accepts buildCandidateId with colons in component IDs', () => {
      // VULN: colons in component IDs create ambiguous parsing
      const id = buildCandidateId('model:v2', 'tactic:v1', 'prov:1');
      // This produces "model:v2:tactic:v1:prov:1" (5+ segments)
      expect(id.split(':').length).toBeGreaterThan(3);
    });

    it('rejects candidateId with too many segments', () => {
      // VULN: parseCandidateId should throw for malformed IDs
      expect(() => parseCandidateId('a:b:c:d:e')).toThrow();
    });

    it('rejects candidateId with empty segments', () => {
      // VULN: empty segments should be rejected
      expect(() => parseCandidateId('::')).toThrow();
    });
  });
});
