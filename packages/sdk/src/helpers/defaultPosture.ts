import { TaskType, DecisionPosture } from '@acds/core-types';

/**
 * Map of sensible default {@link DecisionPosture} values for each {@link TaskType}.
 *
 * These defaults encode the following heuristics:
 * - Creative tasks default to EXPLORATORY.
 * - Analytical, summarization, planning, retrieval_synthesis, generation, reasoning, coding → ADVISORY.
 * - Classification, extraction, transformation → OPERATIONAL.
 * - Decision support, critique → OPERATIONAL.
 */
const DEFAULTS: Record<TaskType, DecisionPosture> = {
  [TaskType.CREATIVE]:             DecisionPosture.EXPLORATORY,
  [TaskType.ANALYTICAL]:           DecisionPosture.ADVISORY,
  [TaskType.DECISION_SUPPORT]:     DecisionPosture.OPERATIONAL,
  [TaskType.CLASSIFICATION]:       DecisionPosture.OPERATIONAL,
  [TaskType.EXTRACTION]:           DecisionPosture.OPERATIONAL,
  [TaskType.SUMMARIZATION]:        DecisionPosture.ADVISORY,
  [TaskType.TRANSFORMATION]:       DecisionPosture.OPERATIONAL,
  [TaskType.CRITIQUE]:             DecisionPosture.OPERATIONAL,
  [TaskType.PLANNING]:             DecisionPosture.ADVISORY,
  [TaskType.RETRIEVAL_SYNTHESIS]:  DecisionPosture.ADVISORY,
  [TaskType.GENERATION]:           DecisionPosture.ADVISORY,
  [TaskType.REASONING]:            DecisionPosture.ADVISORY,
  [TaskType.CODING]:               DecisionPosture.ADVISORY,
};

/**
 * Return the default {@link DecisionPosture} for a given {@link TaskType}.
 */
export function defaultPosture(taskType: TaskType): DecisionPosture {
  return DEFAULTS[taskType];
}
