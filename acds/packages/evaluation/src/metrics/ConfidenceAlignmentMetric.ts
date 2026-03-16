/**
 * ConfidenceAlignmentMetric - Measures how well a model's predicted
 * confidence aligns with the actual execution outcome quality.
 */

export interface ConfidenceAlignmentInput {
  /** Model's predicted confidence score, 0-1. */
  predictedConfidence: number;
  /** Actual quality outcome, 0-1. */
  actualOutcome: number;
}

export class ConfidenceAlignmentMetric {
  /**
   * Computes the confidence alignment score.
   *
   * Score = 1 - |predicted - actual|
   * Perfect alignment = 1.0, complete misalignment = 0.0.
   */
  compute(input: ConfidenceAlignmentInput): number {
    return Math.max(0, 1 - Math.abs(input.predictedConfidence - input.actualOutcome));
  }
}
