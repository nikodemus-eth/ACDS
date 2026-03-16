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

/**
 * In-memory FamilyScoreRepository.
 * Tracks scored executions per family key.
 */
class InMemoryFamilyScoreRepository implements FamilyScoreRepository {
  private readonly scoresByFamily = new Map<string, ExecutionScore[]>();

  addScore(familyKey: string, score: ExecutionScore): void {
    const scores = this.scoresByFamily.get(familyKey) ?? [];
    scores.push(score);
    this.scoresByFamily.set(familyKey, scores);
  }

  async listActiveFamilies(): Promise<string[]> {
    return [...this.scoresByFamily.keys()];
  }

  async getRecentScores(familyKey: string, limit: number): Promise<ExecutionScore[]> {
    const scores = this.scoresByFamily.get(familyKey) ?? [];
    return scores.slice(-limit);
  }
}

/**
 * In-memory FamilyPerformanceRepository.
 * Stores the latest performance summary per family.
 */
class InMemoryFamilyPerformanceRepository implements FamilyPerformanceRepository {
  private readonly summaries = new Map<string, FamilyPerformanceSummary>();

  async saveSummary(summary: FamilyPerformanceSummary): Promise<void> {
    this.summaries.set(summary.familyKey, summary);
  }

  getSummary(familyKey: string): FamilyPerformanceSummary | undefined {
    return this.summaries.get(familyKey);
  }
}

const familyScoreRepo = new InMemoryFamilyScoreRepository();
const familyPerfRepo = new InMemoryFamilyPerformanceRepository();

export function getFamilyScoreRepository(): FamilyScoreRepository & { addScore(familyKey: string, score: ExecutionScore): void } {
  return familyScoreRepo;
}

export function getFamilyPerformanceRepository(): FamilyPerformanceRepository & { getSummary(familyKey: string): FamilyPerformanceSummary | undefined } {
  return familyPerfRepo;
}
