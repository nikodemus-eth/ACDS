/**
 * runPlateauDetection - Runs PlateauDetector for each active family
 * and persists detected signals.
 *
 * All repositories are backed by PostgreSQL via the shared worker pool.
 */

import type {
  PlateauSignal,
  PerformanceSummary,
} from '@acds/adaptive-optimizer';
import { detect } from '@acds/adaptive-optimizer';
import type { Pool } from '@acds/persistence-pg';
import { getSharedOptimizerStateRepository } from '../repositories/workerOptimizerStateRepository.js';
import { getWorkerPool } from '../repositories/createWorkerPool.js';
import { PgPlateauSignalRepository } from '../repositories/PgPlateauSignalRepository.js';

// ── Abstract repository interfaces ────────────────────────────────────────

export interface PerformanceSummaryRepository {
  /** Fetches the aggregated performance summary for a family. */
  getSummary(familyKey: string): Promise<PerformanceSummary | undefined>;
}

export interface PlateauSignalRepository {
  /** Persists a plateau detection signal. */
  saveSignal(signal: PlateauSignal): Promise<void>;
}

export async function runPlateauDetection(): Promise<void> {
  const optimizerRepo = getOptimizerStateRepository();
  const summaryRepo = getPerformanceSummaryRepository();
  const signalRepo = getPlateauSignalRepository();

  const families = await optimizerRepo.listFamilies();

  if (families.length === 0) {
    console.log('[plateau-detection] No active families found.');
    return;
  }

  console.log(`[plateau-detection] Checking ${families.length} family(ies)...`);

  let detected = 0;
  let checked = 0;
  let errors = 0;

  for (const familyKey of families) {
    try {
      const familyState = await optimizerRepo.getFamilyState(familyKey);
      if (!familyState) continue;

      const candidateStates = await optimizerRepo.getCandidateStates(familyKey);
      const summary = await summaryRepo.getSummary(familyKey);
      if (!summary) continue;

      const signal = detect(familyState, candidateStates, summary);
      await signalRepo.saveSignal(signal);

      checked++;
      if (signal.detected) {
        detected++;
        console.log(
          `[plateau-detection] ${familyKey}: plateau detected (severity: ${signal.severity})`,
        );
      }
    } catch (error) {
      errors++;
      console.error(
        `[plateau-detection] Failed for family ${familyKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    `[plateau-detection] Completed: ${checked} checked, ${detected} plateaus detected, ${errors} errors.`,
  );

  if (errors > 0 && checked === 0) {
    throw new Error(
      `[plateau-detection] All ${errors} detection attempt(s) failed. This indicates a systemic issue.`,
    );
  }
}

// ── PG-backed PerformanceSummaryRepository ────────────────────────────────

class PgPerformanceSummaryRepository implements PerformanceSummaryRepository {
  constructor(private readonly pool: Pool) {}

  async getSummary(familyKey: string): Promise<PerformanceSummary | undefined> {
    const result = await this.pool.query(
      `SELECT
         fss.rolling_score,
         fss.recent_trend,
         COALESCE(
           (SELECT COUNT(*) FROM execution_records er
            WHERE er.application = split_part(fss.family_key, ':', 1)
              AND er.process    = split_part(fss.family_key, ':', 2)
              AND er.step       = split_part(fss.family_key, ':', 3)
              AND er.status = 'failed'
              AND er.created_at > NOW() - INTERVAL '1 hour'), 0
         ) AS recent_failure_count,
         COALESCE(
           (SELECT COUNT(*) FROM execution_records er2
            WHERE er2.application = split_part(fss.family_key, ':', 1)
              AND er2.process    = split_part(fss.family_key, ':', 2)
              AND er2.step       = split_part(fss.family_key, ':', 3)
              AND er2.fallback_attempts > 0
              AND er2.created_at > NOW() - INTERVAL '1 hour'), 0
         ) AS recent_fallback_count,
         COALESCE(
           (SELECT COUNT(*) FROM execution_records er3
            WHERE er3.application = split_part(fss.family_key, ':', 1)
              AND er3.process    = split_part(fss.family_key, ':', 2)
              AND er3.step       = split_part(fss.family_key, ':', 3)
              AND er3.created_at > NOW() - INTERVAL '1 hour'), 0
         ) AS recent_total_count
       FROM family_selection_states fss
       WHERE fss.family_key = $1`,
      [familyKey],
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    const rollingScore = Number(row.rolling_score);
    const totalCount = Number(row.recent_total_count);
    const fallbackCount = Number(row.recent_fallback_count);
    const failureCount = Number(row.recent_failure_count);

    return {
      qualityScoreVariance: rollingScore > 0.9 ? 0.005 : 0.05,
      costTrendRising: false,
      correctionBurdenRising: failureCount > 5,
      fallbackRate: totalCount > 0 ? fallbackCount / totalCount : 0,
      minimumAcceptableScore: 0.5,
    };
  }
}

// ── Singleton instances ───────────────────────────────────────────────────

const summaryRepo = new PgPerformanceSummaryRepository(getWorkerPool());
const signalRepo = new PgPlateauSignalRepository(getWorkerPool());

function getOptimizerStateRepository() {
  return getSharedOptimizerStateRepository();
}

export function getPerformanceSummaryRepository(): PerformanceSummaryRepository {
  return summaryRepo;
}

export function getPlateauSignalRepository(): PlateauSignalRepository {
  return signalRepo;
}
