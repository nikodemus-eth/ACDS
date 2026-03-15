/**
 * runPlateauDetection - Runs PlateauDetector for each active family
 * and persists detected signals.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  PlateauSignal,
  PerformanceSummary,
} from '@acds/adaptive-optimizer';
import { detect } from '@acds/adaptive-optimizer';
import { getSharedOptimizerStateRepository } from '../repositories/InMemoryOptimizerStateRepository.js';

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

/**
 * In-memory PerformanceSummaryRepository.
 */
class InMemoryPerformanceSummaryRepository implements PerformanceSummaryRepository {
  private readonly summaries = new Map<string, PerformanceSummary>();

  async getSummary(familyKey: string): Promise<PerformanceSummary | undefined> {
    return this.summaries.get(familyKey);
  }

  setSummary(familyKey: string, summary: PerformanceSummary): void {
    this.summaries.set(familyKey, summary);
  }
}

/**
 * In-memory PlateauSignalRepository.
 */
class InMemoryPlateauSignalRepository implements PlateauSignalRepository {
  private readonly signals: PlateauSignal[] = [];

  async saveSignal(signal: PlateauSignal): Promise<void> {
    this.signals.push(signal);
  }

  getSignals(): PlateauSignal[] {
    return [...this.signals];
  }

  getActiveSignals(): PlateauSignal[] {
    return this.signals.filter((s) => s.detected);
  }
}

const summaryRepo = new InMemoryPerformanceSummaryRepository();
const signalRepo = new InMemoryPlateauSignalRepository();

function getOptimizerStateRepository() {
  return getSharedOptimizerStateRepository();
}

export function getPerformanceSummaryRepository(): PerformanceSummaryRepository & { setSummary(familyKey: string, summary: PerformanceSummary): void } {
  return summaryRepo;
}

export function getPlateauSignalRepository(): PlateauSignalRepository & { getActiveSignals(): PlateauSignal[] } {
  return signalRepo;
}
