import { describe, it, expect } from 'vitest';
import { ArtifactQualityMetric } from './ArtifactQualityMetric.js';

describe('ArtifactQualityMetric', () => {
  const metric = new ArtifactQualityMetric();

  it('computes weighted average with correct weights (40/35/25)', () => {
    const score = metric.compute({ completeness: 1.0, coherence: 1.0, relevance: 1.0 });
    expect(score).toBeCloseTo(1.0);
  });

  it('returns 0 when all inputs are 0', () => {
    const score = metric.compute({ completeness: 0, coherence: 0, relevance: 0 });
    expect(score).toBe(0);
  });

  it('weights completeness at 40%', () => {
    const score = metric.compute({ completeness: 1.0, coherence: 0, relevance: 0 });
    expect(score).toBeCloseTo(0.4);
  });

  it('weights coherence at 35%', () => {
    const score = metric.compute({ completeness: 0, coherence: 1.0, relevance: 0 });
    expect(score).toBeCloseTo(0.35);
  });

  it('weights relevance at 25%', () => {
    const score = metric.compute({ completeness: 0, coherence: 0, relevance: 1.0 });
    expect(score).toBeCloseTo(0.25);
  });

  it('computes mixed values correctly', () => {
    const score = metric.compute({ completeness: 0.8, coherence: 0.6, relevance: 0.4 });
    // 0.8*0.4 + 0.6*0.35 + 0.4*0.25 = 0.32 + 0.21 + 0.10 = 0.63
    expect(score).toBeCloseTo(0.63);
  });
});
