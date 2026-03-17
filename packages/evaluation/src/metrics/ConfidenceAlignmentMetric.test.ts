import { describe, it, expect } from 'vitest';
import { ConfidenceAlignmentMetric } from './ConfidenceAlignmentMetric.js';

describe('ConfidenceAlignmentMetric', () => {
  const metric = new ConfidenceAlignmentMetric();

  it('returns 1.0 for perfect alignment', () => {
    expect(metric.compute({ predictedConfidence: 0.8, actualOutcome: 0.8 })).toBe(1.0);
  });

  it('returns 0.0 for complete misalignment (predicted=1, actual=0)', () => {
    expect(metric.compute({ predictedConfidence: 1.0, actualOutcome: 0.0 })).toBe(0.0);
  });

  it('returns 0.0 for complete misalignment (predicted=0, actual=1)', () => {
    expect(metric.compute({ predictedConfidence: 0.0, actualOutcome: 1.0 })).toBe(0.0);
  });

  it('returns partial score for partial alignment', () => {
    const score = metric.compute({ predictedConfidence: 0.7, actualOutcome: 0.5 });
    // 1 - |0.7 - 0.5| = 1 - 0.2 = 0.8
    expect(score).toBeCloseTo(0.8);
  });

  it('clamps to 0 and never goes negative', () => {
    // Even with extreme values, max(0, ...) applies
    const score = metric.compute({ predictedConfidence: 0, actualOutcome: 1 });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
