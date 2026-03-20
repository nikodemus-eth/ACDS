import type { QualityTier } from './artifact-envelope.js';

// ---------------------------------------------------------------------------
// Quality Model Types
// ---------------------------------------------------------------------------

export interface QualityDimension {
  name: string;
  score: number; // 0.0 – 1.0
}

export interface QualityAssessment {
  tier: QualityTier;
  overallScore: number;
  dimensions: QualityDimension[];
  evaluator: string;
}

export interface QualityThresholds {
  production: number;
  production_candidate: number;
  consumer_demo_grade: number;
  experimental: number;
}

// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  production: 0.95,
  production_candidate: 0.85,
  consumer_demo_grade: 0.65,
  experimental: 0.40,
};

// ---------------------------------------------------------------------------
// Per-Family Quality Dimensions
// ---------------------------------------------------------------------------

export const FAMILY_QUALITY_DIMENSIONS: Record<string, string[]> = {
  TextAssist: ['instruction_adherence', 'meaning_preservation', 'coherence', 'edit_usefulness'],
  TextModel: ['instruction_adherence', 'grounding_faithfulness', 'schema_conformance', 'completeness'],
  Image: ['prompt_alignment', 'style_consistency', 'subject_clarity', 'usability'],
  Expression: ['semantic_clarity', 'emotional_alignment', 'recognizability', 'context_fit'],
  Vision: ['accuracy', 'confidence_alignment', 'completeness', 'hallucination_rate'],
  Action: ['correctness', 'parameter_fidelity', 'success_rate', 'side_effect_accuracy'],
};

// ---------------------------------------------------------------------------
// Quality Assessment
// ---------------------------------------------------------------------------

/**
 * Determines quality tier based on overall score and configurable thresholds.
 */
export function determineQualityTier(
  overallScore: number,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityTier {
  if (overallScore >= thresholds.production) return 'production';
  if (overallScore >= thresholds.production_candidate) return 'production_candidate';
  if (overallScore >= thresholds.consumer_demo_grade) return 'consumer_demo_grade';
  if (overallScore >= thresholds.experimental) return 'experimental';
  return 'none';
}

/**
 * Computes overall score as the mean of dimension scores.
 */
export function computeOverallScore(dimensions: QualityDimension[]): number {
  if (dimensions.length === 0) return 0;
  const sum = dimensions.reduce((acc, d) => acc + d.score, 0);
  return sum / dimensions.length;
}

/**
 * Assesses quality from a set of dimension scores.
 */
export function assessQuality(
  dimensions: QualityDimension[],
  evaluator: string,
  thresholds?: QualityThresholds,
): QualityAssessment {
  const overallScore = computeOverallScore(dimensions);
  return {
    tier: determineQualityTier(overallScore, thresholds),
    overallScore,
    dimensions,
    evaluator,
  };
}

/**
 * Returns the configured quality dimensions for a given artifact family.
 */
export function getQualityDimensionsForFamily(family: string): string[] {
  return FAMILY_QUALITY_DIMENSIONS[family] ?? [];
}
