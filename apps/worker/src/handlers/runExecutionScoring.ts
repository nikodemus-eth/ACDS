/**
 * runExecutionScoring - Fetches recent unscored executions and scores
 * each via the ExecutionEvaluationBridge.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container. For the MVP, they are constructed inline using
 * environment-driven configuration.
 */

import type { ExecutionOutcome } from '@acds/execution-orchestrator';
import { evaluateOutcome } from '@acds/execution-orchestrator';
import type { ExecutionScore } from '@acds/evaluation';

// ── Abstract repository interface ─────────────────────────────────────────

export interface UnscoredExecutionRepository {
  /** Fetches recent executions that have not yet been scored. */
  fetchUnscored(limit: number): Promise<ExecutionOutcome[]>;
  /** Marks an execution as scored and stores the result. */
  markScored(executionId: string, score: ExecutionScore): Promise<void>;
}

const DEFAULT_BATCH_SIZE = 50;

export async function runExecutionScoring(): Promise<void> {
  const repository = getUnscoredExecutionRepository();
  const batchSize = parseInt(
    process.env.SCORING_BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE),
    10,
  );

  const unscored = await repository.fetchUnscored(batchSize);

  if (unscored.length === 0) {
    console.log('[execution-scoring] No unscored executions found.');
    return;
  }

  console.log(`[execution-scoring] Scoring ${unscored.length} execution(s)...`);

  let scored = 0;
  let errors = 0;

  for (const outcome of unscored) {
    try {
      const { executionScore } = evaluateOutcome(outcome);
      await repository.markScored(outcome.executionId, executionScore);
      scored++;
    } catch (error) {
      errors++;
      console.error(
        `[execution-scoring] Failed to score execution ${outcome.executionId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    `[execution-scoring] Completed: ${scored} scored, ${errors} errors.`,
  );
}

/**
 * Placeholder factory for UnscoredExecutionRepository.
 * Will be replaced by DI container resolution.
 */
function getUnscoredExecutionRepository(): UnscoredExecutionRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'UnscoredExecutionRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}
