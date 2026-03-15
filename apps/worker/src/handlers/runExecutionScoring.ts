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
  const parsed = parseInt(
    process.env.SCORING_BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE),
    10,
  );
  const batchSize = Number.isNaN(parsed) ? DEFAULT_BATCH_SIZE : parsed;

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

  if (errors > 0 && scored === 0) {
    throw new Error(
      `[execution-scoring] All ${errors} scoring attempt(s) failed. This indicates a systemic issue.`,
    );
  }
}

/**
 * In-memory UnscoredExecutionRepository.
 *
 * Stores execution outcomes and scores in memory. Outcomes are submitted
 * via `submitOutcome` (called by the ExecutionOutcomePublisher bridge)
 * and consumed by `fetchUnscored`.
 */
class InMemoryUnscoredExecutionRepository implements UnscoredExecutionRepository {
  private readonly unscored: ExecutionOutcome[] = [];
  private readonly scored = new Map<string, ExecutionScore>();

  submitOutcome(outcome: ExecutionOutcome): void {
    this.unscored.push(outcome);
  }

  async fetchUnscored(limit: number): Promise<ExecutionOutcome[]> {
    return this.unscored.splice(0, limit);
  }

  async markScored(executionId: string, score: ExecutionScore): Promise<void> {
    this.scored.set(executionId, score);
  }

  getScore(executionId: string): ExecutionScore | undefined {
    return this.scored.get(executionId);
  }
}

const unscoredRepo = new InMemoryUnscoredExecutionRepository();

export function getUnscoredExecutionRepository(): UnscoredExecutionRepository & { submitOutcome(outcome: ExecutionOutcome): void } {
  return unscoredRepo;
}
