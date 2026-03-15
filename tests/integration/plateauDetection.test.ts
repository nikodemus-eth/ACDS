// ---------------------------------------------------------------------------
// Integration Tests – Plateau Detection (Prompt 59)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types for the plateau detection domain
// ---------------------------------------------------------------------------

type PlateauSeverity = 'none' | 'mild' | 'severe';

interface PlateauIndicator {
  name: string;
  detected: boolean;
  detail: string;
}

interface PlateauSignal {
  familyKey: string;
  severity: PlateauSeverity;
  indicators: PlateauIndicator[];
  windowSize: number;
  recommendation: string;
}

interface QualityWindow {
  scores: number[];
  timestamps: Date[];
}

// ---------------------------------------------------------------------------
// Mock plateau detection logic (simulates @acds/adaptive-scoring)
// ---------------------------------------------------------------------------

function detectPlateau(familyKey: string, window: QualityWindow): PlateauSignal {
  const { scores } = window;
  const indicators: PlateauIndicator[] = [];

  if (scores.length < 5) {
    return {
      familyKey,
      severity: 'none',
      indicators: [],
      windowSize: scores.length,
      recommendation: 'insufficient data for plateau detection',
    };
  }

  // Indicator 1: Flat quality (low variance)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const flatQuality = variance < 0.001;
  indicators.push({
    name: 'flat_quality',
    detected: flatQuality,
    detail: `variance=${variance.toFixed(6)}, threshold=0.001`,
  });

  // Indicator 2: No improvement trend
  const mid = Math.floor(scores.length / 2);
  const firstAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
  const noImprovement = secondAvg - firstAvg < 0.01;
  indicators.push({
    name: 'no_improvement_trend',
    detected: noImprovement,
    detail: `delta=${(secondAvg - firstAvg).toFixed(4)}, threshold=0.01`,
  });

  // Indicator 3: Score ceiling (consistently near max observed)
  const maxScore = Math.max(...scores);
  const recentScores = scores.slice(-3);
  const nearCeiling = recentScores.every((s) => maxScore - s < 0.02);
  indicators.push({
    name: 'score_ceiling',
    detected: nearCeiling,
    detail: `max=${maxScore.toFixed(4)}, recent within 0.02`,
  });

  const detectedCount = indicators.filter((i) => i.detected).length;

  let severity: PlateauSeverity;
  let recommendation: string;

  if (detectedCount >= 2) {
    severity = 'severe';
    recommendation = 'consider exploring alternative model profiles or tactics';
  } else if (detectedCount === 1) {
    severity = 'mild';
    recommendation = 'monitor for further stagnation before adapting';
  } else {
    severity = 'none';
    recommendation = 'family performance is still progressing';
  }

  return {
    familyKey,
    severity,
    indicators,
    windowSize: scores.length,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimestamps(count: number): Date[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => new Date(now - (count - i) * 60_000));
}

// ===========================================================================
// No Plateau for Improving Family
// ===========================================================================

describe('Plateau Detection – No Plateau for Improving Family', () => {
  it('reports no plateau when scores are steadily improving', () => {
    const scores = [0.60, 0.63, 0.67, 0.71, 0.75, 0.79, 0.83, 0.87];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('thingstead.governance.advisory', window);

    expect(signal.severity).toBe('none');
    expect(signal.indicators.every((i) => !i.detected)).toBe(true);
  });

  it('recommendation indicates ongoing progress', () => {
    const scores = [0.50, 0.55, 0.60, 0.66, 0.72, 0.78];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('thingstead.governance.advisory', window);

    expect(signal.recommendation).toContain('progressing');
  });
});

// ===========================================================================
// Mild Plateau for Flat Quality
// ===========================================================================

describe('Plateau Detection – Mild Plateau for Flat Quality', () => {
  it('detects mild plateau when quality is flat but not all indicators fire', () => {
    // Flat quality (low variance) but still some improvement
    const scores = [0.80, 0.80, 0.80, 0.80, 0.81, 0.81, 0.81, 0.82];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('app.process.step', window);

    expect(signal.severity).toBe('mild');
    const flatIndicator = signal.indicators.find((i) => i.name === 'flat_quality');
    expect(flatIndicator).toBeDefined();
    expect(flatIndicator!.detected).toBe(true);
  });

  it('recommends monitoring rather than immediate action', () => {
    const scores = [0.80, 0.80, 0.80, 0.80, 0.80, 0.81, 0.81, 0.81];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('app.process.step', window);

    expect(signal.recommendation).toContain('monitor');
  });
});

// ===========================================================================
// Severe Plateau for Multiple Indicators
// ===========================================================================

describe('Plateau Detection – Severe Plateau for Multiple Indicators', () => {
  it('detects severe plateau when multiple indicators are triggered', () => {
    // Completely flat: low variance, no improvement, near ceiling
    const scores = [0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('thingstead.legal.review', window);

    expect(signal.severity).toBe('severe');
    const detected = signal.indicators.filter((i) => i.detected);
    expect(detected.length).toBeGreaterThanOrEqual(2);
  });

  it('recommends exploring alternatives for severe plateau', () => {
    const scores = [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('thingstead.legal.review', window);

    expect(signal.recommendation).toContain('exploring alternative');
  });
});

// ===========================================================================
// Plateau Signal Structure
// ===========================================================================

describe('Plateau Detection – Signal Structure', () => {
  it('includes the family key in the signal', () => {
    const scores = [0.70, 0.71, 0.72, 0.73, 0.74];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('myapp.myprocess.mystep', window);

    expect(signal.familyKey).toBe('myapp.myprocess.mystep');
  });

  it('includes window size in the signal', () => {
    const scores = [0.70, 0.71, 0.72, 0.73, 0.74, 0.75];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('app.proc.step', window);

    expect(signal.windowSize).toBe(6);
  });

  it('each indicator has name, detected flag, and detail', () => {
    const scores = [0.70, 0.71, 0.72, 0.73, 0.74, 0.75, 0.76, 0.77];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('app.proc.step', window);

    for (const indicator of signal.indicators) {
      expect(indicator).toHaveProperty('name');
      expect(indicator).toHaveProperty('detected');
      expect(indicator).toHaveProperty('detail');
      expect(typeof indicator.name).toBe('string');
      expect(typeof indicator.detected).toBe('boolean');
      expect(typeof indicator.detail).toBe('string');
    }
  });

  it('returns none severity for insufficient data', () => {
    const scores = [0.70, 0.71];
    const window: QualityWindow = { scores, timestamps: makeTimestamps(scores.length) };

    const signal = detectPlateau('app.proc.step', window);

    expect(signal.severity).toBe('none');
    expect(signal.indicators).toHaveLength(0);
    expect(signal.recommendation).toContain('insufficient');
  });
});
