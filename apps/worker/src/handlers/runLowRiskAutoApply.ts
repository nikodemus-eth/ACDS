/**
 * runLowRiskAutoApply - Iterates families with pending recommendations
 * in auto_apply mode and applies them via LowRiskAutoApplyService when
 * the family qualifies as low-risk.
 *
 * All repositories are backed by PostgreSQL via the shared worker pool.
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
import type { Pool } from '@acds/persistence-pg';
import { getSharedOptimizerStateRepository } from '../repositories/workerOptimizerStateRepository.js';
import { getWorkerPool } from '../repositories/createWorkerPool.js';
import { getAdaptiveModeProvider as getSharedModeProvider } from './runAdaptationRecommendations.js';

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

// ── PG-backed PendingRecommendationReader ──────────────────────────────────

class PgPendingRecommendationReader implements PendingRecommendationReader {
  constructor(private readonly pool: Pool) {}

  async listPendingForAutoApply(): Promise<AdaptationRecommendation[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_approval_records
       WHERE status = 'pending'
       ORDER BY submitted_at DESC`,
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      id: r.recommendation_id as string,
      familyKey: r.family_key as string,
      recommendedRanking: [],
      evidence: (r.reason as string) ?? '',
      status: (r.status as AdaptationRecommendation['status']) ?? 'pending',
      createdAt: r.submitted_at as string,
    }));
  }
}

function getPendingRecommendationReader(): PendingRecommendationReader {
  return pendingReader;
}

function getAdaptiveModeProvider(): AdaptiveModeProvider {
  return getSharedModeProvider();
}

/**
 * StaticFamilyRiskProvider - Classifies all families as low-risk.
 * This is a legitimate policy default for systems where risk
 * classification has not been configured per-family.
 */
class StaticFamilyRiskProvider implements FamilyRiskProvider {
  async getRiskLevel(_familyKey: string): Promise<FamilyRiskLevel> {
    return 'low';
  }
}

/**
 * StaticFamilyPostureProvider - Returns 'advisory' for all families.
 * This is a legitimate policy default for systems where posture
 * has not been configured per-family.
 */
class StaticFamilyPostureProvider implements FamilyPostureProvider {
  async getPosture(_familyKey: string): Promise<string> {
    return 'advisory';
  }
}

class PgRecentFailureCounter implements RecentFailureCounter {
  constructor(private readonly pool: Pool) {}

  async countRecentFailures(familyKey: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) AS count FROM execution_records
       WHERE status = 'failed'
         AND application = $1
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [familyKey.split(':')[0]],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}

class PgAutoApplyDecisionWriter implements AutoApplyDecisionWriter {
  constructor(private readonly pool: Pool) {}

  async save(record: AutoApplyDecisionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO auto_apply_decision_records (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.familyKey,
        JSON.stringify(record.previousRanking),
        JSON.stringify(record.newRanking),
        record.reason,
        record.mode,
        record.riskBasis,
        record.appliedAt,
      ],
    );
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

// ── Singleton instances ───────────────────────────────────────────────────

const pool = getWorkerPool();
const pendingReader = new PgPendingRecommendationReader(pool);
const riskProvider = new StaticFamilyRiskProvider();
const postureProvider = new StaticFamilyPostureProvider();
const failureCounter = new PgRecentFailureCounter(pool);
const decisionWriter = new PgAutoApplyDecisionWriter(pool);
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
