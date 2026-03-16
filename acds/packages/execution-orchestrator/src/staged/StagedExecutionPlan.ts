/**
 * StagedExecutionPlan - Defines a multi-stage execution pipeline where
 * each stage processes output from the previous stage.
 */

export interface ExecutionStage {
  /** Human-readable name of this stage. */
  name: string;
  /** The task type identifier for this stage. */
  taskType: string;
  /** Description of what this stage accomplishes. */
  description: string;
  /** Optional transform applied to the previous stage's output before passing as input. */
  inputTransform?: (previousOutput: unknown) => unknown;
}

export interface StagedExecutionPlan {
  /** Unique identifier for this execution plan. */
  id: string;
  /** Ordered list of stages to execute. */
  stages: ExecutionStage[];
  /** Strategy for combining stage results into the final output. */
  aggregationStrategy: 'last_stage' | 'concatenate' | 'structured_merge';
}
