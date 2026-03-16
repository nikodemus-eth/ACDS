/**
 * ArtifactQualityMetric - Evaluates the quality of a generated artifact
 * based on completeness, coherence, and relevance.
 */

export interface ArtifactQualityInput {
  /** How complete the artifact is, 0-1. */
  completeness: number;
  /** How coherent and well-structured the artifact is, 0-1. */
  coherence: number;
  /** How relevant the artifact is to the original task, 0-1. */
  relevance: number;
}

export class ArtifactQualityMetric {
  /**
   * Computes the artifact quality score as a weighted average.
   *
   * Weights: completeness 40%, coherence 35%, relevance 25%.
   */
  compute(input: ArtifactQualityInput): number {
    return input.completeness * 0.4 + input.coherence * 0.35 + input.relevance * 0.25;
  }
}
