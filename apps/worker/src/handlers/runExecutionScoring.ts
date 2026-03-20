/**
 * runExecutionScoring - Fetches recent unscored executions and scores
 * each via the ExecutionEvaluationBridge.
 *
 * All repositories are backed by PostgreSQL via the shared worker pool.
 */

import type { ExecutionOutcome } from '@acds/execution-orchestrator';
import { evaluateOutcome } from '@acds/execution-orchestrator';
import type { ExecutionScore } from '@acds/evaluation';
import type { Pool } from '@acds/persistence-pg';
import { getWorkerPool } from '../repositories/createWorkerPool.js';

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

// ── PG-backed UnscoredExecutionRepository ─────────────────────────────────

class PgUnscoredExecutionRepository implements UnscoredExecutionRepository {
  constructor(private readonly pool: Pool) {}

  async fetchUnscored(limit: number): Promise<ExecutionOutcome[]> {
    const result = await this.pool.query(
      `SELECT
         id,
         application,
         process,
         step,
         status,
         COALESCE(latency_ms, 0) AS latency_ms,
         normalized_output,
         selected_model_profile_id,
         input_tokens,
         output_tokens,
         cost_estimate,
         created_at
       FROM execution_records
       WHERE scored_at IS NULL
         AND status IN ('succeeded', 'failed')
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      executionId: r.id as string,
      familyKey: `${r.application}:${r.process}:${r.step}`,
      status: r.status === 'succeeded' ? ('success' as const) : ('failure' as const),
      latencyMs: Number(r.latency_ms),
      adapterResponseSummary: {
        modelProfileId: r.selected_model_profile_id,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        costEstimate: r.cost_estimate != null ? Number(r.cost_estimate) : undefined,
        normalizedOutput: r.normalized_output,
      },
      timestamp: (r.created_at as Date).toISOString(),
    }));
  }

  async markScored(executionId: string, _score: ExecutionScore): Promise<void> {
    await this.pool.query(
      `UPDATE execution_records SET scored_at = NOW() WHERE id = $1`,
      [executionId],
    );
  }
}

// ── Singleton instance ────────────────────────────────────────────────────

const unscoredRepo = new PgUnscoredExecutionRepository(getWorkerPool());

export function getUnscoredExecutionRepository(): UnscoredExecutionRepository {
  return unscoredRepo;
}
