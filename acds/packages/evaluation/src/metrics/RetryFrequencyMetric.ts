/**
 * RetryFrequencyMetric - Evaluates execution quality based on how many
 * retries were needed. Fewer retries indicate a more reliable execution.
 */

export interface RetryFrequencyInput {
  /** Number of retries that occurred during execution. */
  retryCount: number;
  /** Maximum retries allowed by the execution policy. */
  maxRetriesAllowed: number;
}

export class RetryFrequencyMetric {
  /**
   * Computes the retry frequency score.
   *
   * Score = 1 - (retryCount / maxRetriesAllowed)
   * No retries = 1.0, max retries = 0.0.
   */
  compute(input: RetryFrequencyInput): number {
    if (input.maxRetriesAllowed <= 0) return 1;
    return Math.max(0, 1 - (input.retryCount / input.maxRetriesAllowed));
  }
}
