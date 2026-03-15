/**
 * FamilyValueScore - Computes a value score for an execution family
 * based on acceptance rate, volume, and cost efficiency.
 */

export interface FamilyValueInput {
  /** The execution family identifier. */
  familyKey: string;
  /** Acceptance rate for this family, 0-1. */
  acceptanceRate: number;
  /** Total number of executions in the observation window. */
  executionVolume: number;
  /** Average cost per execution run. */
  averageCostPerRun: number;
}

export class FamilyValueScorer {
  /**
   * Computes the value score for a family.
   *
   * Value = (acceptanceRate * executionVolume) / max(averageCostPerRun, 0.001)
   */
  compute(input: FamilyValueInput): number {
    const cost = Math.max(input.averageCostPerRun, 0.001);
    return (input.acceptanceRate * input.executionVolume) / cost;
  }
}
