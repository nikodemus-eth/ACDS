/**
 * EscalationTuningService - Evaluates family performance and policy
 * constraints to tune the escalation preference for a family.
 *
 * This service never bypasses forced escalation for final or evidentiary
 * postures. It only adjusts timing for postures where escalation is
 * advisory or optional.
 */

import type { EscalationPreference, EscalationTuningState } from './EscalationTuningState.js';

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface PerformanceSummaryForTuning {
  /** Rolling score for the family (0-1). */
  rollingScore: number;

  /** Recent trend: improving, stable, or declining. */
  recentTrend: 'improving' | 'stable' | 'declining';

  /** Number of recent local execution failures. */
  recentLocalFailures: number;

  /** Number of recent escalated execution successes. */
  recentEscalatedSuccesses: number;

  /** Total recent executions. */
  recentExecutionCount: number;
}

export interface PolicyConstraints {
  /** The current posture of the family (e.g. exploratory, advisory, final, evidentiary). */
  posture: string;

  /** If true, escalation is forced by policy (e.g. final/evidentiary postures). */
  forcedEscalation: boolean;

  /** Minimum confidence required before adjusting from default. */
  minConfidenceThreshold: number;
}

// ── Thresholds ─────────────────────────────────────────────────────────────

const HIGH_LOCAL_FAILURE_RATE = 0.3;
const LOW_ESCALATION_SUCCESS_RATE = 0.2;
const HIGH_ROLLING_SCORE = 0.75;
const LOW_ROLLING_SCORE = 0.4;

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Evaluates family performance data and policy constraints to determine
 * the optimal escalation preference.
 *
 * @param familyKey - The family to tune.
 * @param summary - Recent performance summary for the family.
 * @param constraints - Policy constraints governing escalation behavior.
 * @returns The tuned EscalationTuningState.
 */
export function evaluateAndTune(
  familyKey: string,
  summary: PerformanceSummaryForTuning,
  constraints: PolicyConstraints,
): EscalationTuningState {
  const now = new Date().toISOString();

  // Never bypass forced escalation for final/evidentiary postures.
  if (constraints.forcedEscalation) {
    return {
      familyKey,
      preference: 'early_escalate',
      confidence: 1.0,
      lastEvaluatedAt: now,
    };
  }

  let preference: EscalationPreference = 'normal_escalate';
  let confidence = 0.5;

  const localFailureRate =
    summary.recentExecutionCount > 0
      ? summary.recentLocalFailures / summary.recentExecutionCount
      : 0;

  const escalatedSuccessRate =
    summary.recentExecutionCount > 0
      ? summary.recentEscalatedSuccesses / summary.recentExecutionCount
      : 0;

  // High local failure rate suggests early escalation
  if (localFailureRate >= HIGH_LOCAL_FAILURE_RATE) {
    preference = 'early_escalate';
    confidence = Math.min(0.9, 0.5 + localFailureRate);
  }
  // Strong local performance suggests delaying escalation
  else if (
    summary.rollingScore >= HIGH_ROLLING_SCORE &&
    summary.recentTrend !== 'declining' &&
    localFailureRate === 0
  ) {
    preference = 'local_preferred_until_fail';
    confidence = Math.min(0.9, 0.5 + (summary.rollingScore - 0.5));
  }
  // Declining trend with low rolling score suggests early escalation
  else if (
    summary.recentTrend === 'declining' &&
    summary.rollingScore < LOW_ROLLING_SCORE
  ) {
    preference = 'early_escalate';
    confidence = 0.7;
  }
  // High escalation success with stable/improving trend suggests delayed
  else if (
    escalatedSuccessRate < LOW_ESCALATION_SUCCESS_RATE &&
    summary.recentTrend !== 'declining'
  ) {
    preference = 'delayed_escalate';
    confidence = 0.6;
  }

  // If confidence is below the policy threshold, fall back to normal
  if (confidence < constraints.minConfidenceThreshold) {
    preference = 'normal_escalate';
    confidence = constraints.minConfidenceThreshold;
  }

  return {
    familyKey,
    preference,
    confidence,
    lastEvaluatedAt: now,
  };
}
