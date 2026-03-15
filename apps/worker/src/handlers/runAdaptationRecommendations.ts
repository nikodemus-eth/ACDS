/**
 * runAdaptationRecommendations - Generates recommendations via
 * AdaptationRecommendationService for families with plateau signals.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  PlateauSignal,
  AdaptiveMode,
  AdaptationRecommendation,
} from '@acds/adaptive-optimizer';
import { generateRecommendation, rankCandidates } from '@acds/adaptive-optimizer';
import { randomUUID } from 'node:crypto';
import { getSharedOptimizerStateRepository } from '../repositories/InMemoryOptimizerStateRepository.js';
import { getPlateauSignalRepository } from './runPlateauDetection.js';

// ── Abstract repository interfaces ────────────────────────────────────────

export interface PlateauSignalReader {
  /** Lists families with active (detected) plateau signals. */
  listActivePlateaus(): Promise<PlateauSignal[]>;
}

export interface AdaptationRecommendationRepository {
  /** Persists a new adaptation recommendation. */
  save(recommendation: AdaptationRecommendation): Promise<void>;
}

export interface AdaptiveModeProvider {
  /** Returns the current adaptive mode for a family (or the global default). */
  getModeForFamily(familyKey: string): Promise<AdaptiveMode>;
}

export async function runAdaptationRecommendations(): Promise<void> {
  const optimizerRepo = getOptimizerStateRepository();
  const plateauReader = getPlateauSignalReader();
  const recommendationRepo = getAdaptationRecommendationRepository();
  const modeProvider = getAdaptiveModeProvider();

  const activePlateaus = await plateauReader.listActivePlateaus();

  if (activePlateaus.length === 0) {
    console.log('[adaptation-recommendation] No active plateau signals found.');
    return;
  }

  console.log(
    `[adaptation-recommendation] Processing ${activePlateaus.length} plateau signal(s)...`,
  );

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const plateauSignal of activePlateaus) {
    try {
      const familyKey = plateauSignal.familyKey;
      const familyState = await optimizerRepo.getFamilyState(familyKey);
      if (!familyState) {
        skipped++;
        continue;
      }

      const candidateStates = await optimizerRepo.getCandidateStates(familyKey);
      if (candidateStates.length === 0) {
        skipped++;
        continue;
      }

      const mode = await modeProvider.getModeForFamily(familyKey);
      const rankingSnapshot = rankCandidates(candidateStates, familyState);

      const recommendation = generateRecommendation({
        id: randomUUID(),
        familyKey,
        plateauSignal,
        rankingSnapshot,
        familyState,
        mode,
      });

      if (recommendation) {
        await recommendationRepo.save(recommendation);
        generated++;
        console.log(
          `[adaptation-recommendation] Generated recommendation for ${familyKey} (status: ${recommendation.status})`,
        );
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      console.error(
        `[adaptation-recommendation] Failed for family ${plateauSignal.familyKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    `[adaptation-recommendation] Completed: ${generated} generated, ${skipped} skipped, ${errors} errors.`,
  );

  if (errors > 0 && generated === 0 && skipped === 0) {
    throw new Error(
      `[adaptation-recommendation] All ${errors} attempt(s) failed. This indicates a systemic issue.`,
    );
  }
}

function getOptimizerStateRepository() {
  return getSharedOptimizerStateRepository();
}

/**
 * In-memory PlateauSignalReader that reads from the shared plateau signal repository.
 */
class InMemoryPlateauSignalReader implements PlateauSignalReader {
  async listActivePlateaus(): Promise<PlateauSignal[]> {
    return getPlateauSignalRepository().getActiveSignals();
  }
}

/**
 * In-memory AdaptationRecommendationRepository.
 */
class InMemoryAdaptationRecommendationRepository implements AdaptationRecommendationRepository {
  private readonly recommendations: AdaptationRecommendation[] = [];

  async save(recommendation: AdaptationRecommendation): Promise<void> {
    this.recommendations.push(recommendation);
  }

  getAll(): AdaptationRecommendation[] {
    return [...this.recommendations];
  }

  getPending(): AdaptationRecommendation[] {
    return this.recommendations.filter((r) => r.status === 'pending');
  }
}

/**
 * Default AdaptiveModeProvider that returns the configured default mode.
 * Defaults to 'recommend_only' — the safest non-passive mode.
 */
class DefaultAdaptiveModeProvider implements AdaptiveModeProvider {
  private readonly defaultMode: AdaptiveMode;

  constructor(defaultMode: AdaptiveMode = 'recommend_only') {
    this.defaultMode = defaultMode;
  }

  async getModeForFamily(_familyKey: string): Promise<AdaptiveMode> {
    return this.defaultMode;
  }
}

const plateauSignalReader = new InMemoryPlateauSignalReader();
const recommendationRepo = new InMemoryAdaptationRecommendationRepository();
const adaptiveModeProvider = new DefaultAdaptiveModeProvider();

function getPlateauSignalReader(): PlateauSignalReader {
  return plateauSignalReader;
}

export function getAdaptationRecommendationRepository(): AdaptationRecommendationRepository & { getPending(): AdaptationRecommendation[] } {
  return recommendationRepo;
}

export function getAdaptiveModeProvider(): AdaptiveModeProvider {
  return adaptiveModeProvider;
}
