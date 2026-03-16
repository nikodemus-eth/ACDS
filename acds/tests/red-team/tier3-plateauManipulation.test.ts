/**
 * ARGUS-9 Tier 3 — Plateau Detection Manipulation
 *
 * Tests that PlateauDetector config can be abused to force false positives,
 * false negatives, and severity misclassification.
 */

import { describe, it, expect } from 'vitest';
import { detect } from '@acds/adaptive-optimizer';
import type { PerformanceSummary, PlateauDetectorConfig } from '@acds/adaptive-optimizer';
import { makeFamilyState, makeCandidateState } from './_fixtures.js';

function makeSummary(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    qualityScoreVariance: 0.005,
    costTrendRising: false,
    correctionBurdenRising: false,
    fallbackRate: 0.0,
    minimumAcceptableScore: 0.5,
    ...overrides,
  };
}

describe('ARGUS F11-F13: Plateau Detection Manipulation', () => {

  it('permits mildThreshold: 0 — everything is always in plateau', () => {
    // VULN: mildThreshold=0 means 0 active indicators triggers mild severity
    const family = makeFamilyState({ rollingScore: 0.9 });
    const candidates = [makeCandidateState({ rollingScore: 0.9, successRate: 0.95 })];
    // All indicators false — healthy family
    const summary = makeSummary({
      qualityScoreVariance: 0.5,
      costTrendRising: false,
      correctionBurdenRising: false,
      fallbackRate: 0.0,
    });

    const signal = detect(family, candidates, summary, { mildThreshold: 0 });
    // 0 active indicators >= mildThreshold of 0 → mild → detected
    expect(signal.detected).toBe(true);
    expect(signal.severity).toBe('mild');
  });

  it('permits reversed severity thresholds — severe fires before moderate', () => {
    // VULN: no validation that severeThreshold > moderateThreshold > mildThreshold
    const family = makeFamilyState({ rollingScore: 0.3 });
    const candidates = [makeCandidateState({ rollingScore: 0.3 })];
    // 2 active indicators: flatQuality + persistentUnderperformance
    const summary = makeSummary({
      qualityScoreVariance: 0.001,
      costTrendRising: false,
      correctionBurdenRising: false,
      fallbackRate: 0.0,
    });

    const config: Partial<PlateauDetectorConfig> = {
      mildThreshold: 3,
      moderateThreshold: 2,
      severeThreshold: 1,
    };
    const signal = detect(family, candidates, summary, config);
    // 2 indicators: >= severeThreshold (1) → severe, even though only 2 indicators
    expect(signal.severity).toBe('severe');
    expect(signal.detected).toBe(true);
  });

  it('permits flatQualityVarianceThreshold: 1.0 — false plateau for almost any data', () => {
    // VULN: threshold so high that even high variance is "flat"
    const family = makeFamilyState({ rollingScore: 0.8 });
    const candidates = [makeCandidateState({ rollingScore: 0.8 })];
    const summary = makeSummary({
      qualityScoreVariance: 0.9, // very high variance — NOT flat
      costTrendRising: true,
    });

    const signal = detect(family, candidates, summary, {
      flatQualityVarianceThreshold: 1.0,
      mildThreshold: 2,
    });
    // 0.9 < 1.0 → flatQuality=true, plus costTrendRising=true → 2 indicators → mild
    expect(signal.indicators.flatQuality).toBe(true);
    expect(signal.detected).toBe(true);
  });

  it('accepts fallbackRate > 1.0 — no bounds validation on summary inputs', () => {
    // VULN: no validation that fallbackRate is between 0 and 1
    const family = makeFamilyState();
    const candidates = [makeCandidateState()];
    const summary = makeSummary({ fallbackRate: 5.0 });

    const signal = detect(family, candidates, summary);
    // 5.0 > 0.2 threshold → repeatedFallbacks=true
    expect(signal.indicators.repeatedFallbacks).toBe(true);
  });

  it('permits underperformanceScoreThreshold to force all families into underperformance', () => {
    // VULN: setting threshold to 1.0 means any score < 1.0 is underperforming
    const family = makeFamilyState({ rollingScore: 0.99 });
    const candidates = [makeCandidateState({ rollingScore: 0.99 })];
    const summary = makeSummary({ costTrendRising: true });

    const signal = detect(family, candidates, summary, {
      underperformanceScoreThreshold: 1.0,
      mildThreshold: 2,
    });
    // 0.99 < 1.0 → persistentUnderperformance=true, plus costTrendRising → 2 indicators
    expect(signal.indicators.persistentUnderperformance).toBe(true);
    expect(signal.detected).toBe(true);
  });

  it('accepts negative thresholds — no bounds on config values', () => {
    // VULN: negative thresholds have undefined semantics
    const family = makeFamilyState();
    const candidates = [makeCandidateState()];
    const summary = makeSummary();

    const signal = detect(family, candidates, summary, {
      flatQualityVarianceThreshold: -1,
      fallbackRateThreshold: -1,
      underperformanceScoreThreshold: -1,
    });
    // Negative thresholds: variance 0.005 < -1 is false, fallbackRate 0.0 > -1 is true,
    // avgScore 0.8 < -1 is false
    expect(signal.indicators.repeatedFallbacks).toBe(true);
  });

  it('produces no plateau with empty candidates and healthy family', () => {
    // Edge case: empty candidates array falls back to familyState.rollingScore
    const family = makeFamilyState({ rollingScore: 0.9 });
    const summary = makeSummary({
      qualityScoreVariance: 0.5,
      costTrendRising: false,
      correctionBurdenRising: false,
      fallbackRate: 0.0,
    });

    const signal = detect(family, [], summary);
    expect(signal.detected).toBe(false);
    expect(signal.severity).toBe('none');
  });

  it('uses familyState.rollingScore as fallback when candidates array is empty', () => {
    // VULN: with empty candidates, uses familyState.rollingScore which may be stale
    const family = makeFamilyState({ rollingScore: 0.1 });
    const summary = makeSummary({ costTrendRising: true });

    const signal = detect(family, [], summary, { mildThreshold: 2 });
    // rollingScore 0.1 < 0.5 threshold → persistentUnderperformance=true
    // plus costTrendRising → 2 indicators → mild
    expect(signal.indicators.persistentUnderperformance).toBe(true);
    expect(signal.detected).toBe(true);
  });
});
