/**
 * runFamilyAggregation - Updates family performance summaries via
 * ExecutionHistoryAggregator for all active families.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import {
  ExecutionHistoryAggregator,
  buildFamilyPerformanceSummary,
  type ExecutionScore,
  type FamilyPerformanceSummary,
} from '@acds/evaluation';

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
  const windowSize = parseInt(
    process.env.AGGREGATION_WINDOW_SIZE ?? String(DEFAULT_WINDOW_SIZE),
    10,
  );

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
}

/**
 * Placeholder factory for FamilyScoreRepository.
 * Will be replaced by DI container resolution.
 */
function getFamilyScoreRepository(): FamilyScoreRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'FamilyScoreRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

/**
 * Placeholder factory for FamilyPerformanceRepository.
 * Will be replaced by DI container resolution.
 */
function getFamilyPerformanceRepository(): FamilyPerformanceRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'FamilyPerformanceRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}
