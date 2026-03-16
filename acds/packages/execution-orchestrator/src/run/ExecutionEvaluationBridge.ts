/**
 * ExecutionEvaluationBridge - Bridges execution results to evaluation scoring.
 *
 * Takes an ExecutionOutcome and evaluation services, produces MetricResult[]
 * and an ExecutionScore. This is a thin bridge only: it delegates all
 * scoring logic to @acds/evaluation.
 */

import type { ExecutionOutcome } from '../events/ExecutionOutcomePublisher.js';
import type { MetricResult, ExecutionScore, WeightConfig } from '@acds/evaluation';
import { evaluateAcceptance } from '@acds/evaluation';
import { evaluateLatency } from '@acds/evaluation';
import { calculateExecutionScore } from '@acds/evaluation';

export interface EvaluationServices {
  /** Optional weight config for the score calculator. */
  weightConfig?: WeightConfig;

  /** Latency thresholds for the latency metric. */
  latencyThresholds?: {
    idealMs: number;
    maxMs: number;
  };
}

export interface EvaluationBridgeResult {
  /** Individual metric results computed from the execution outcome. */
  metricResults: MetricResult[];

  /** Weighted composite execution score. */
  executionScore: ExecutionScore;
}

/**
 * Evaluates an execution outcome by computing metric results and
 * a composite execution score.
 *
 * @param outcome - The normalized execution outcome.
 * @param services - Evaluation configuration and thresholds.
 * @returns The metric results and composite execution score.
 */
export function evaluateOutcome(
  outcome: ExecutionOutcome,
  services: EvaluationServices = {},
): EvaluationBridgeResult {
  const metricResults: MetricResult[] = [];

  // ── Acceptance metric ───────────────────────────────────────────────
  const acceptanceOutcome = outcome.status === 'success' || outcome.status === 'fallback_success'
    ? 'accepted'
    : 'rejected';

  const acceptanceResult = evaluateAcceptance({
    acceptance: acceptanceOutcome,
  });
  metricResults.push(acceptanceResult);

  // ── Latency metric ──────────────────────────────────────────────────
  const thresholds = services.latencyThresholds ?? {
    idealMs: 500,
    maxMs: 10000,
  };

  const latencyResult = evaluateLatency({
    latencyMs: outcome.latencyMs,
  }, thresholds);
  metricResults.push(latencyResult);

  // ── Composite score ─────────────────────────────────────────────────
  const executionScore = calculateExecutionScore(metricResults, services.weightConfig);

  return { metricResults, executionScore };
}
