import { describe, it, expect } from 'vitest';
import {
  assessQuality,
  determineQualityTier,
  computeOverallScore,
  DEFAULT_QUALITY_THRESHOLDS,
  getQualityDimensionsForFamily,
} from '../../../src/artifact/quality-model.js';

describe('Quality Model', () => {
  describe('computeOverallScore', () => {
    it('averages dimension scores', () => {
      const score = computeOverallScore([
        { name: 'a', score: 0.8 },
        { name: 'b', score: 0.6 },
      ]);
      expect(score).toBeCloseTo(0.7);
    });

    it('returns 0 for empty dimensions', () => {
      expect(computeOverallScore([])).toBe(0);
    });
  });

  describe('determineQualityTier', () => {
    it('returns production for score >= 0.95', () => {
      expect(determineQualityTier(0.96, DEFAULT_QUALITY_THRESHOLDS)).toBe('production');
    });

    it('returns consumer_demo_grade for score >= 0.65', () => {
      expect(determineQualityTier(0.70, DEFAULT_QUALITY_THRESHOLDS)).toBe('consumer_demo_grade');
    });

    it('returns none for score below experimental', () => {
      expect(determineQualityTier(0.1, DEFAULT_QUALITY_THRESHOLDS)).toBe('none');
    });
  });

  describe('assessQuality', () => {
    it('produces a complete quality assessment', () => {
      const assessment = assessQuality(
        [
          { name: 'coherence', score: 0.8 },
          { name: 'accuracy', score: 0.9 },
        ],
        'auto',
        DEFAULT_QUALITY_THRESHOLDS,
      );
      expect(assessment.overallScore).toBeCloseTo(0.85);
      expect(assessment.tier).toBe('production_candidate');
      expect(assessment.dimensions).toHaveLength(2);
    });
  });

  describe('getQualityDimensionsForFamily', () => {
    it('returns dimensions for TextAssist', () => {
      const dims = getQualityDimensionsForFamily('TextAssist');
      expect(dims).toContain('instruction_adherence');
      expect(dims).toContain('meaning_preservation');
    });

    it('returns empty array for unknown family', () => {
      expect(getQualityDimensionsForFamily('Unknown')).toEqual([]);
    });
  });
});
