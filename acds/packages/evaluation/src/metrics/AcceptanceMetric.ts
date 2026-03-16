/**
 * AcceptanceMetric - Evaluates whether an execution result was accepted,
 * partially accepted, or rejected.
 */

export interface MetricResult {
  /** Normalized score between 0 and 1. */
  score: number;
  /** Human-readable label for the metric. */
  label: string;
  /** Additional details about the evaluation. */
  details: Record<string, unknown>;
}

export type AcceptanceOutcome = 'accepted' | 'partial' | 'rejected';

export interface AcceptanceRecord {
  /** The acceptance outcome of the execution. */
  acceptance: AcceptanceOutcome;
}

const ACCEPTANCE_SCORES: Record<AcceptanceOutcome, number> = {
  accepted: 1.0,
  partial: 0.5,
  rejected: 0.0,
};

/**
 * Evaluates the acceptance outcome of an execution record.
 *
 * @param record - A record containing an acceptance field.
 * @returns A MetricResult with score: 1.0 (accepted), 0.5 (partial), or 0.0 (rejected).
 */
export function evaluateAcceptance(record: AcceptanceRecord): MetricResult {
  const score = ACCEPTANCE_SCORES[record.acceptance] ?? 0.0;

  return {
    score,
    label: 'acceptance',
    details: {
      outcome: record.acceptance,
    },
  };
}
