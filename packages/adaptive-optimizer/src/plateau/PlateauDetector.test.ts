import { describe, it, expect } from 'vitest';
import { detect, type PerformanceSummary } from './PlateauDetector.js';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';

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

function makeSummary(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    qualityScoreVariance: 0.05,  // above threshold (not flat)
    costTrendRising: false,
    correctionBurdenRising: false,
    fallbackRate: 0.1,           // below threshold
    minimumAcceptableScore: 0.5,
    ...overrides,
  };
}

describe('PlateauDetector.detect', () => {
  describe('indicator detection', () => {
    it('detects flatQuality when variance < threshold', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ qualityScoreVariance: 0.005 }));
      expect(signal.indicators.flatQuality).toBe(true);
    });

    it('does not detect flatQuality when variance >= threshold', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ qualityScoreVariance: 0.01 }));
      expect(signal.indicators.flatQuality).toBe(false);
    });

    it('detects risingCost when costTrendRising is true', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ costTrendRising: true }));
      expect(signal.indicators.risingCost).toBe(true);
    });

    it('detects risingCorrectionBurden when correctionBurdenRising is true', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ correctionBurdenRising: true }));
      expect(signal.indicators.risingCorrectionBurden).toBe(true);
    });

    it('detects repeatedFallbacks when fallbackRate > threshold', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ fallbackRate: 0.25 }));
      expect(signal.indicators.repeatedFallbacks).toBe(true);
    });

    it('does not detect repeatedFallbacks when fallbackRate <= threshold', () => {
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ fallbackRate: 0.2 }));
      expect(signal.indicators.repeatedFallbacks).toBe(false);
    });

    it('detects persistentUnderperformance when avg score < threshold', () => {
      const candidates = [
        makeCandidate({ rollingScore: 0.3 }),
        makeCandidate({ rollingScore: 0.4 }),
      ];
      // avg = 0.35, below default 0.5
      const signal = detect(makeFamilyState(), candidates, makeSummary());
      expect(signal.indicators.persistentUnderperformance).toBe(true);
    });

    it('does not detect persistentUnderperformance when avg score >= threshold', () => {
      const candidates = [makeCandidate({ rollingScore: 0.6 })];
      const signal = detect(makeFamilyState(), candidates, makeSummary());
      expect(signal.indicators.persistentUnderperformance).toBe(false);
    });

    it('uses familyState.rollingScore when no candidates', () => {
      const signal = detect(makeFamilyState({ rollingScore: 0.3 }), [], makeSummary());
      expect(signal.indicators.persistentUnderperformance).toBe(true);
    });

    it('uses familyState.rollingScore when no candidates and score is above threshold', () => {
      const signal = detect(makeFamilyState({ rollingScore: 0.8 }), [], makeSummary());
      expect(signal.indicators.persistentUnderperformance).toBe(false);
    });
  });

  describe('severity classification', () => {
    it('returns none when fewer than mildThreshold indicators fire', () => {
      // 1 indicator: flatQuality only
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({ qualityScoreVariance: 0.005 }));
      expect(signal.severity).toBe('none');
      expect(signal.detected).toBe(false);
    });

    it('returns mild when exactly mildThreshold indicators fire', () => {
      // 2 indicators: flatQuality + risingCost
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({
        qualityScoreVariance: 0.005,
        costTrendRising: true,
      }));
      expect(signal.severity).toBe('mild');
      expect(signal.detected).toBe(true);
    });

    it('returns moderate when moderateThreshold indicators fire', () => {
      // 3 indicators
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({
        qualityScoreVariance: 0.005,
        costTrendRising: true,
        correctionBurdenRising: true,
      }));
      expect(signal.severity).toBe('moderate');
      expect(signal.detected).toBe(true);
    });

    it('returns severe when severeThreshold indicators fire', () => {
      // 4 indicators
      const signal = detect(makeFamilyState(), [makeCandidate()], makeSummary({
        qualityScoreVariance: 0.005,
        costTrendRising: true,
        correctionBurdenRising: true,
        fallbackRate: 0.25,
      }));
      expect(signal.severity).toBe('severe');
      expect(signal.detected).toBe(true);
    });

    it('returns severe when all 5 indicators fire', () => {
      const signal = detect(makeFamilyState(), [makeCandidate({ rollingScore: 0.3 })], makeSummary({
        qualityScoreVariance: 0.005,
        costTrendRising: true,
        correctionBurdenRising: true,
        fallbackRate: 0.25,
      }));
      expect(signal.severity).toBe('severe');
      expect(signal.detected).toBe(true);
    });
  });

  describe('custom config', () => {
    it('uses custom flatQualityVarianceThreshold', () => {
      const signal = detect(
        makeFamilyState(), [makeCandidate()],
        makeSummary({ qualityScoreVariance: 0.05 }),
        { flatQualityVarianceThreshold: 0.1 },
      );
      expect(signal.indicators.flatQuality).toBe(true);
    });

    it('uses custom fallbackRateThreshold', () => {
      const signal = detect(
        makeFamilyState(), [makeCandidate()],
        makeSummary({ fallbackRate: 0.15 }),
        { fallbackRateThreshold: 0.1 },
      );
      expect(signal.indicators.repeatedFallbacks).toBe(true);
    });

    it('uses custom underperformanceScoreThreshold', () => {
      const signal = detect(
        makeFamilyState(), [makeCandidate({ rollingScore: 0.7 })],
        makeSummary(),
        { underperformanceScoreThreshold: 0.8 },
      );
      expect(signal.indicators.persistentUnderperformance).toBe(true);
    });

    it('uses custom severity thresholds', () => {
      // With mildThreshold=1, a single indicator should be mild
      const signal = detect(
        makeFamilyState(), [makeCandidate()],
        makeSummary({ costTrendRising: true }),
        { mildThreshold: 1 },
      );
      expect(signal.severity).toBe('mild');
      expect(signal.detected).toBe(true);
    });
  });

  it('always includes familyKey and detectedAt', () => {
    const signal = detect(makeFamilyState({ familyKey: 'custom:key' }), [], makeSummary());
    expect(signal.familyKey).toBe('custom:key');
    expect(new Date(signal.detectedAt).getTime()).not.toBeNaN();
  });
});
