/**
 * LowRiskAutoApplyService - Inspects pending recommendations and applies
 * them automatically when the family qualifies as low-risk under the
 * current adaptive mode policy.
 *
 * Qualification criteria:
 * - Posture is exploratory, advisory, or draft (not final/evidentiary).
 * - No recent failures recorded in the family state.
 * - Rolling score is above a configurable threshold.
 * - Family is not classified as high-consequence.
 *
 * No provider execution occurs here; this only mutates optimizer state.
 */

import { randomUUID } from 'node:crypto';
import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { AdaptationRecommendation } from './AdaptationRecommendationService.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { AutoApplyDecisionRecord } from './AutoApplyDecisionRecord.js';
import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';
import { isAutoApplyPermitted, type FamilyRiskLevel } from './AdaptiveModePolicy.js';

// ── Configuration ──────────────────────────────────────────────────────────

export interface LowRiskAutoApplyConfig {
  /** Minimum rolling score required for auto-apply. Default: 0.5 */
  rollingScoreThreshold: number;

  /** Maximum number of recent failures permitted. Default: 0 */
  maxRecentFailures: number;
}

const DEFAULT_CONFIG: LowRiskAutoApplyConfig = {
  rollingScoreThreshold: 0.5,
  maxRecentFailures: 0,
};

// ── Postures that qualify for low-risk auto-apply ──────────────────────────

const QUALIFYING_POSTURES: ReadonlySet<string> = new Set([
  'exploratory',
  'advisory',
  'draft',
]);

// ── Interfaces required by the service ─────────────────────────────────────

export interface FamilyRiskProvider {
  /** Returns the risk level for a family. */
  getRiskLevel(familyKey: string): Promise<FamilyRiskLevel>;
}

export interface FamilyPostureProvider {
  /** Returns the current posture for a family (e.g. exploratory, final). */
  getPosture(familyKey: string): Promise<string>;
}

export interface RecentFailureCounter {
  /** Returns the count of recent failures for a family. */
  countRecentFailures(familyKey: string): Promise<number>;
}

export interface AutoApplyDecisionWriter {
  /** Persists an auto-apply decision record. */
  save(record: AutoApplyDecisionRecord): Promise<void>;
}

// ── Service ────────────────────────────────────────────────────────────────

export class LowRiskAutoApplyService {
  private readonly config: LowRiskAutoApplyConfig;

  constructor(
    private readonly riskProvider: FamilyRiskProvider,
    private readonly postureProvider: FamilyPostureProvider,
    private readonly failureCounter: RecentFailureCounter,
    private readonly decisionWriter: AutoApplyDecisionWriter,
    config?: Partial<LowRiskAutoApplyConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Inspects a recommendation against the family's state and applies it
   * automatically if all low-risk criteria are met.
   *
   * @param familyKey - The execution family key.
   * @param recommendation - The pending recommendation to evaluate.
   * @param familyState - Current family selection state.
   * @param currentRanking - The current candidate ranking for the family.
   * @param mode - The adaptive mode in effect.
   * @returns An AutoApplyDecisionRecord if applied, or null if not eligible.
   */
  async inspectAndApply(
    familyKey: string,
    recommendation: AdaptationRecommendation,
    familyState: FamilySelectionState,
    currentRanking: RankedCandidate[],
    mode: AdaptiveMode,
  ): Promise<AutoApplyDecisionRecord | null> {
    // 1. Check risk level and mode compatibility
    const riskLevel = await this.riskProvider.getRiskLevel(familyKey);

    if (!isAutoApplyPermitted(mode, riskLevel)) {
      return null;
    }

    // 2. Refuse high-consequence families regardless
    if (riskLevel === 'high') {
      return null;
    }

    // 3. Check posture qualification
    const posture = await this.postureProvider.getPosture(familyKey);
    if (!QUALIFYING_POSTURES.has(posture)) {
      return null;
    }

    // 4. Check for recent failures
    const recentFailures = await this.failureCounter.countRecentFailures(familyKey);
    if (recentFailures > this.config.maxRecentFailures) {
      return null;
    }

    // 5. Check rolling score threshold
    if (familyState.rollingScore < this.config.rollingScoreThreshold) {
      return null;
    }

    // All criteria met - apply the recommendation
    const record: AutoApplyDecisionRecord = {
      id: randomUUID(),
      familyKey,
      previousRanking: currentRanking,
      newRanking: recommendation.recommendedRanking,
      reason: `Low-risk auto-apply: posture=${posture}, risk=${riskLevel}, rollingScore=${familyState.rollingScore.toFixed(4)}, recentFailures=${recentFailures}.`,
      mode,
      riskBasis: riskLevel,
      appliedAt: new Date().toISOString(),
    };

    await this.decisionWriter.save(record);

    return record;
  }
}
