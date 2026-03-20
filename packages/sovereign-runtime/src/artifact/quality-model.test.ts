import { describe, it, expect } from 'vitest';
import { determineQualityTier, computeOverallScore, assessQuality, getQualityDimensionsForFamily, DEFAULT_QUALITY_THRESHOLDS, FAMILY_QUALITY_DIMENSIONS } from './quality-model.js';

describe('Quality Model', () => {
  it('determineQualityTier returns production for high scores', () => {
    expect(determineQualityTier(0.96)).toBe('production');
  });

  it('determineQualityTier returns production_candidate', () => {
    expect(determineQualityTier(0.90)).toBe('production_candidate');
  });

  it('determineQualityTier returns consumer_demo_grade', () => {
    expect(determineQualityTier(0.70)).toBe('consumer_demo_grade');
  });

  it('determineQualityTier returns experimental', () => {
    expect(determineQualityTier(0.45)).toBe('experimental');
  });

  it('determineQualityTier returns none for low scores', () => {
    expect(determineQualityTier(0.1)).toBe('none');
  });

  it('computeOverallScore averages dimensions', () => {
    expect(computeOverallScore([{ name: 'a', score: 0.8 }, { name: 'b', score: 0.6 }])).toBeCloseTo(0.7);
  });

  it('computeOverallScore returns 0 for empty', () => {
    expect(computeOverallScore([])).toBe(0);
  });

  it('assessQuality returns full assessment', () => {
    const assessment = assessQuality([{ name: 'a', score: 0.9 }, { name: 'b', score: 0.8 }], 'auto');
    expect(assessment.tier).toBe('production_candidate');
    expect(assessment.overallScore).toBeCloseTo(0.85);
    expect(assessment.evaluator).toBe('auto');
    expect(assessment.dimensions).toHaveLength(2);
  });

  it('assessQuality accepts custom thresholds', () => {
    const assessment = assessQuality([{ name: 'a', score: 0.5 }], 'auto', { production: 0.4, production_candidate: 0.3, consumer_demo_grade: 0.2, experimental: 0.1 });
    expect(assessment.tier).toBe('production');
  });

  it('getQualityDimensionsForFamily returns known families', () => {
    expect(getQualityDimensionsForFamily('TextAssist').length).toBeGreaterThan(0);
    expect(getQualityDimensionsForFamily('Vision').length).toBeGreaterThan(0);
  });

  it('getQualityDimensionsForFamily returns empty for unknown', () => {
    expect(getQualityDimensionsForFamily('Unknown')).toEqual([]);
  });

  it('DEFAULT_QUALITY_THRESHOLDS has ordered thresholds', () => {
    expect(DEFAULT_QUALITY_THRESHOLDS.production).toBeGreaterThan(DEFAULT_QUALITY_THRESHOLDS.production_candidate);
    expect(DEFAULT_QUALITY_THRESHOLDS.production_candidate).toBeGreaterThan(DEFAULT_QUALITY_THRESHOLDS.consumer_demo_grade);
    expect(DEFAULT_QUALITY_THRESHOLDS.consumer_demo_grade).toBeGreaterThan(DEFAULT_QUALITY_THRESHOLDS.experimental);
  });

  it('FAMILY_QUALITY_DIMENSIONS covers all families', () => {
    const families = Object.keys(FAMILY_QUALITY_DIMENSIONS);
    expect(families).toContain('TextAssist');
    expect(families).toContain('TextModel');
    expect(families).toContain('Image');
    expect(families).toContain('Expression');
    expect(families).toContain('Vision');
    expect(families).toContain('Action');
  });
});
