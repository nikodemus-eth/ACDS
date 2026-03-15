/**
 * runPlateauDetection - Runs PlateauDetector for each active family
 * and persists detected signals.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  OptimizerStateRepository,
  PlateauSignal,
  PerformanceSummary,
} from '@acds/adaptive-optimizer';
import { detect } from '@acds/adaptive-optimizer';

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
}

/**
 * Placeholder factories for repositories.
 * Will be replaced by DI container resolution.
 */
function getOptimizerStateRepository(): OptimizerStateRepository {
  throw new Error(
    'OptimizerStateRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getPerformanceSummaryRepository(): PerformanceSummaryRepository {
  throw new Error(
    'PerformanceSummaryRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getPlateauSignalRepository(): PlateauSignalRepository {
  throw new Error(
    'PlateauSignalRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}
