/**
 * runFamilyAggregation - Updates family performance summaries via
 * ExecutionHistoryAggregator for all active families.
 *
 * All repositories are backed by PostgreSQL via the shared worker pool.
 */

import {
  ExecutionHistoryAggregator,
  buildFamilyPerformanceSummary,
  type ExecutionScore,
  type FamilyPerformanceSummary,
} from '@acds/evaluation';
import type { Pool } from '@acds/persistence-pg';
import { getWorkerPool } from '../repositories/createWorkerPool.js';

// ── Abstract repository interfaces ────────────────────────────────────────

export interface FamilyScoreRepository {
  /** Lists all active family keys that have scored executions. */
  listActiveFamilies(): Promise<string[]>;
  /** Fetches recent execution scores for a family. */
  getRecentScores(familyKey: string, limit: number): Promise<ExecutionScore[]>;
}

export interface FamilyPerformanceRepository {
  /** Persists an updated family performance summary. */
  saveSummary(summary: FamilyPerformanceSummary): Promise<void>;
}

const DEFAULT_WINDOW_SIZE = 50;

export async function runFamilyAggregation(): Promise<void> {
  const scoreRepo = getFamilyScoreRepository();
  const perfRepo = getFamilyPerformanceRepository();
  const parsed = parseInt(
    process.env.AGGREGATION_WINDOW_SIZE ?? String(DEFAULT_WINDOW_SIZE),
    10,
  );
  const windowSize = Number.isNaN(parsed) ? DEFAULT_WINDOW_SIZE : parsed;

  const families = await scoreRepo.listActiveFamilies();

  if (families.length === 0) {
    console.log('[family-aggregation] No active families found.');
    return;
  }

  console.log(`[family-aggregation] Aggregating ${families.length} family(ies)...`);

  let updated = 0;
  let errors = 0;

  for (const familyKey of families) {
    try {
      const scores = await scoreRepo.getRecentScores(familyKey, windowSize);

      const aggregator = new ExecutionHistoryAggregator(windowSize);
      for (const score of scores) {
        aggregator.addRecord(score);
      }

      const stats = aggregator.getStats();
      const summary = buildFamilyPerformanceSummary(familyKey, aggregator.getWindow(), stats);

      await perfRepo.saveSummary(summary);
      updated++;
    } catch (error) {
      errors++;
      console.error(
        `[family-aggregation] Failed to aggregate family ${familyKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    `[family-aggregation] Completed: ${updated} updated, ${errors} errors.`,
  );

  if (errors > 0 && updated === 0) {
    throw new Error(
      `[family-aggregation] All ${errors} aggregation attempt(s) failed. This indicates a systemic issue.`,
    );
  }
}

// ── PG-backed FamilyScoreRepository ───────────────────────────────────────

class PgFamilyScoreRepository implements FamilyScoreRepository {
  constructor(private readonly pool: Pool) {}

  async listActiveFamilies(): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT family_key FROM family_selection_states ORDER BY family_key`,
    );
    return result.rows.map((r: Record<string, unknown>) => r.family_key as string);
  }

  async getRecentScores(familyKey: string, limit: number): Promise<ExecutionScore[]> {
    const parts = familyKey.split(':');
    const application = parts[0] ?? '';
    const process = parts[1] ?? '';
    const step = parts[2] ?? '';

    const result = await this.pool.query(
      `SELECT
         COALESCE(cost_estimate, 0) AS cost_estimate,
         COALESCE(latency_ms, 0) AS latency_ms,
         status,
         normalized_output,
         created_at
       FROM execution_records
       WHERE application = $1 AND process = $2 AND step = $3
         AND status IN ('succeeded', 'failed')
       ORDER BY created_at DESC
       LIMIT $4`,
      [application, process, step, limit],
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      compositeScore: r.status === 'succeeded' ? 1.0 : 0.0,
      metricResults: [],
      resolvedWeights: {},
    }));
  }
}

// ── PG-backed FamilyPerformanceRepository ─────────────────────────────────

class PgFamilyPerformanceWriter implements FamilyPerformanceRepository {
  constructor(private readonly pool: Pool) {}

  async saveSummary(summary: FamilyPerformanceSummary): Promise<void> {
    await this.pool.query(
      `INSERT INTO family_selection_states (family_key, current_candidate_id, rolling_score, recent_trend, last_adaptation_at)
       VALUES ($1, '', $2, 'stable', $3)
       ON CONFLICT (family_key) DO UPDATE SET
         rolling_score = EXCLUDED.rolling_score,
         last_adaptation_at = EXCLUDED.last_adaptation_at`,
      [summary.familyKey, summary.rollingScore, summary.lastUpdated.toISOString()],
    );
  }
}

// ── Singleton instances ───────────────────────────────────────────────────

const familyScoreRepo = new PgFamilyScoreRepository(getWorkerPool());
const familyPerfRepo = new PgFamilyPerformanceWriter(getWorkerPool());

export function getFamilyScoreRepository(): FamilyScoreRepository {
  return familyScoreRepo;
}

export function getFamilyPerformanceRepository(): FamilyPerformanceRepository {
  return familyPerfRepo;
}
