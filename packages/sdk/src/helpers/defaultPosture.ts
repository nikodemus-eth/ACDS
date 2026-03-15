import { TaskType, DecisionPosture } from '@acds/core-types';

/**
 * Map of sensible default {@link DecisionPosture} values for each {@link TaskType}.
 *
 * These defaults encode the following heuristics:
 * - Creative / exploratory tasks default to EXPLORATORY.
 * - Analysis and synthesis default to ADVISORY.
 * - Classification, extraction, and transformation default to DRAFT (structured output likely).
 * - Critique and decision-support default to REVIEW.
 * - Planning defaults to ADVISORY.
 */
const DEFAULTS: Record<TaskType, DecisionPosture> = {
  [TaskType.CREATIVE]:             DecisionPosture.EXPLORATORY,
  [TaskType.ANALYSIS]:             DecisionPosture.ADVISORY,
  [TaskType.DECISION_SUPPORT]:     DecisionPosture.REVIEW,
  [TaskType.CLASSIFICATION]:       DecisionPosture.DRAFT,
  [TaskType.EXTRACTION]:           DecisionPosture.DRAFT,
  [TaskType.SUMMARIZATION]:        DecisionPosture.ADVISORY,
  [TaskType.TRANSFORMATION]:       DecisionPosture.DRAFT,
  [TaskType.CRITIQUE]:             DecisionPosture.REVIEW,
  [TaskType.PLANNING]:             DecisionPosture.ADVISORY,
  [TaskType.RETRIEVAL_SYNTHESIS]:  DecisionPosture.ADVISORY,
};

/**
 * Return the default {@link DecisionPosture} for a given {@link TaskType}.
 */
export function defaultPosture(taskType: TaskType): DecisionPosture {
  return DEFAULTS[taskType];
}
