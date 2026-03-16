import { TaskType } from '@acds/core-types';

/**
 * Task types that typically require structured (machine-readable) output.
 */
const STRUCTURED_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  TaskType.CLASSIFICATION,
  TaskType.EXTRACTION,
  TaskType.TRANSFORMATION,
  TaskType.DECISION_SUPPORT,
]);

/**
 * Determine whether structured output should be required for a given
 * {@link TaskType}.
 *
 * @returns `true` when the task type conventionally demands structured
 *          (e.g. JSON) output; `false` otherwise.
 */
export function structuredOutputRequired(taskType: TaskType): boolean {
  return STRUCTURED_TASK_TYPES.has(taskType);
}
