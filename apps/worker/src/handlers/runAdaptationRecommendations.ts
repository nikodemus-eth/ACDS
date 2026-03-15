/**
 * runAdaptationRecommendations - Generates recommendations via
 * AdaptationRecommendationService for families with plateau signals.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  OptimizerStateRepository,
  PlateauSignal,
  AdaptiveMode,
  AdaptationRecommendation,
} from '@acds/adaptive-optimizer';
import { generateRecommendation, rankCandidates } from '@acds/adaptive-optimizer';
import { randomUUID } from 'node:crypto';

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

function getPlateauSignalReader(): PlateauSignalReader {
  throw new Error(
    'PlateauSignalReader not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getAdaptationRecommendationRepository(): AdaptationRecommendationRepository {
  throw new Error(
    'AdaptationRecommendationRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getAdaptiveModeProvider(): AdaptiveModeProvider {
  throw new Error(
    'AdaptiveModeProvider not yet wired. Configure DI container or set DATABASE_URL.',
  );
}
