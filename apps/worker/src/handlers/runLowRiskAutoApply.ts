/**
 * runLowRiskAutoApply - Iterates families with pending recommendations
 * in auto_apply mode and applies them via LowRiskAutoApplyService when
 * the family qualifies as low-risk.
 *
 * In a full implementation, the repository instances would be injected
 * via a DI container.
 */

import type {
  AdaptiveMode,
  AdaptationRecommendation,
  AutoApplyDecisionRecord,
} from '@acds/adaptive-optimizer';
import {
  LowRiskAutoApplyService,
  type FamilyRiskProvider,
  type FamilyPostureProvider,
  type RecentFailureCounter,
  type AutoApplyDecisionWriter,
  type AutoApplyStateApplier,
  type FamilyRiskLevel,
} from '@acds/adaptive-optimizer';
import { rankCandidates } from '@acds/adaptive-optimizer';
import { getSharedOptimizerStateRepository } from '../repositories/InMemoryOptimizerStateRepository.js';
import { getAdaptationRecommendationRepository, getAdaptiveModeProvider as getSharedModeProvider } from './runAdaptationRecommendations.js';

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
    undefined,
    getAutoApplyStateApplier(),
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

  if (errors > 0 && applied === 0 && skipped === 0) {
    throw new Error(
      `[low-risk-auto-apply] All ${errors} attempt(s) failed. This indicates a systemic issue.`,
    );
  }
}

// ── Working implementations ────────────────────────────────────────────────

function getOptimizerStateRepository() {
  return getSharedOptimizerStateRepository();
}

class InMemoryPendingRecommendationReader implements PendingRecommendationReader {
  async listPendingForAutoApply(): Promise<AdaptationRecommendation[]> {
    return getAdaptationRecommendationRepository().getPending();
  }
}

function getPendingRecommendationReader(): PendingRecommendationReader {
  return new InMemoryPendingRecommendationReader();
}

function getAdaptiveModeProvider(): AdaptiveModeProvider {
  return getSharedModeProvider();
}

/**
 * Default risk provider — classifies all families as low-risk.
 * In a database-backed setup, this would read from a risk classification table.
 */
class DefaultFamilyRiskProvider implements FamilyRiskProvider {
  async getRiskLevel(_familyKey: string): Promise<FamilyRiskLevel> {
    return 'low';
  }
}

/**
 * Default posture provider — returns 'advisory' for all families.
 * In a database-backed setup, this would read the family's configured posture.
 */
class DefaultFamilyPostureProvider implements FamilyPostureProvider {
  async getPosture(_familyKey: string): Promise<string> {
    return 'advisory';
  }
}

/**
 * Default failure counter — returns 0 recent failures.
 * In a database-backed setup, this would count recent failed executions.
 */
class DefaultRecentFailureCounter implements RecentFailureCounter {
  async countRecentFailures(_familyKey: string): Promise<number> {
    return 0;
  }
}

/**
 * In-memory auto-apply decision writer.
 */
class InMemoryAutoApplyDecisionWriter implements AutoApplyDecisionWriter {
  private readonly decisions: AutoApplyDecisionRecord[] = [];

  async save(record: AutoApplyDecisionRecord): Promise<void> {
    this.decisions.push(record);
  }

  getAll(): AutoApplyDecisionRecord[] {
    return [...this.decisions];
  }
}

class OptimizerStateAutoApplyApplier implements AutoApplyStateApplier {
  constructor(private readonly optimizerRepo: ReturnType<typeof getSharedOptimizerStateRepository>) {}

  async apply(record: AutoApplyDecisionRecord): Promise<void> {
    const current = await this.optimizerRepo.getFamilyState(record.familyKey);
    if (!current) {
      throw new Error(`Family state not found for auto-apply: ${record.familyKey}`);
    }

    const nextCandidate = record.newRanking[0]?.candidate.candidateId;
    if (!nextCandidate) {
      throw new Error(`Auto-apply record for ${record.familyKey} has no ranked candidates`);
    }

    await this.optimizerRepo.saveFamilyState({
      ...current,
      currentCandidateId: nextCandidate,
      lastAdaptationAt: record.appliedAt,
    });
  }
}

const riskProvider = new DefaultFamilyRiskProvider();
const postureProvider = new DefaultFamilyPostureProvider();
const failureCounter = new DefaultRecentFailureCounter();
const decisionWriter = new InMemoryAutoApplyDecisionWriter();
const autoApplyStateApplier = new OptimizerStateAutoApplyApplier(getSharedOptimizerStateRepository());

function getFamilyRiskProvider(): FamilyRiskProvider {
  return riskProvider;
}

function getFamilyPostureProvider(): FamilyPostureProvider {
  return postureProvider;
}

function getRecentFailureCounter(): RecentFailureCounter {
  return failureCounter;
}

function getAutoApplyDecisionWriter(): AutoApplyDecisionWriter {
  return decisionWriter;
}

function getAutoApplyStateApplier(): AutoApplyStateApplier {
  return autoApplyStateApplier;
}
