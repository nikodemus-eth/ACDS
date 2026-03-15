/**
 * runLowRiskAutoApply - Iterates families with pending recommendations
 * in auto_apply mode and applies them via LowRiskAutoApplyService when
 * the family qualifies as low-risk.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  OptimizerStateRepository,
  AdaptiveMode,
  AdaptationRecommendation,
} from '@acds/adaptive-optimizer';
import {
  LowRiskAutoApplyService,
  type FamilyRiskProvider,
  type FamilyPostureProvider,
  type RecentFailureCounter,
  type AutoApplyDecisionWriter,
} from '@acds/adaptive-optimizer';
import { rankCandidates } from '@acds/adaptive-optimizer';

// ── Abstract reader interfaces ─────────────────────────────────────────────

export interface PendingRecommendationReader {
  /** Lists recommendations in 'pending' status for auto-apply eligible families. */
  listPendingForAutoApply(): Promise<AdaptationRecommendation[]>;
}

export interface AdaptiveModeProvider {
  /** Returns the current adaptive mode for a family. */
  getModeForFamily(familyKey: string): Promise<AdaptiveMode>;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function runLowRiskAutoApply(): Promise<void> {
  const optimizerRepo = getOptimizerStateRepository();
  const recommendationReader = getPendingRecommendationReader();
  const modeProvider = getAdaptiveModeProvider();
  const riskProvider = getFamilyRiskProvider();
  const postureProvider = getFamilyPostureProvider();
  const failureCounter = getRecentFailureCounter();
  const decisionWriter = getAutoApplyDecisionWriter();

  const service = new LowRiskAutoApplyService(
    riskProvider,
    postureProvider,
    failureCounter,
    decisionWriter,
  );

  const pending = await recommendationReader.listPendingForAutoApply();

  if (pending.length === 0) {
    console.log('[low-risk-auto-apply] No pending recommendations for auto-apply.');
    return;
  }

  console.log(
    `[low-risk-auto-apply] Evaluating ${pending.length} pending recommendation(s)...`,
  );

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const recommendation of pending) {
    try {
      const familyKey = recommendation.familyKey;
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
      const currentRanking = rankCandidates(candidateStates, familyState);

      const decision = await service.inspectAndApply(
        familyKey,
        recommendation,
        familyState,
        currentRanking,
        mode,
      );

      if (decision) {
        applied++;
        console.log(
          `[low-risk-auto-apply] Applied recommendation for ${familyKey}: ${decision.reason}`,
        );
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      console.error(
        `[low-risk-auto-apply] Failed for family ${recommendation.familyKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    `[low-risk-auto-apply] Completed: ${applied} applied, ${skipped} skipped, ${errors} errors.`,
  );
}

// ── Placeholder factories ──────────────────────────────────────────────────

function getOptimizerStateRepository(): OptimizerStateRepository {
  throw new Error(
    'OptimizerStateRepository not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getPendingRecommendationReader(): PendingRecommendationReader {
  throw new Error(
    'PendingRecommendationReader not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getAdaptiveModeProvider(): AdaptiveModeProvider {
  throw new Error(
    'AdaptiveModeProvider not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getFamilyRiskProvider(): FamilyRiskProvider {
  throw new Error(
    'FamilyRiskProvider not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getFamilyPostureProvider(): FamilyPostureProvider {
  throw new Error(
    'FamilyPostureProvider not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getRecentFailureCounter(): RecentFailureCounter {
  throw new Error(
    'RecentFailureCounter not yet wired. Configure DI container or set DATABASE_URL.',
  );
}

function getAutoApplyDecisionWriter(): AutoApplyDecisionWriter {
  throw new Error(
    'AutoApplyDecisionWriter not yet wired. Configure DI container or set DATABASE_URL.',
  );
}
