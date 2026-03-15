/**
 * ExecutionHistoryAggregator - Aggregates execution scores into rolling
 * windows and computes summary statistics.
 */

import type { ExecutionScore } from '../scoring/ExecutionScoreCalculator.js';

export interface WindowStats {
  /** Mean composite score across the window. */
  mean: number;
  /** Standard deviation of composite scores. */
  stddev: number;
  /** Minimum composite score in the window. */
  min: number;
  /** Maximum composite score in the window. */
  max: number;
  /** Number of records in the window. */
  count: number;
}

export class ExecutionHistoryAggregator {
  private readonly windowSize: number;
  private readonly records: ExecutionScore[] = [];

  /**
   * @param windowSize - Maximum number of records in the rolling window. Default: 50.
   */
  constructor(windowSize: number = 50) {
    this.windowSize = windowSize;
  }

  /**
   * Adds an execution score to the rolling window.
   * If the window is full, the oldest record is evicted.
   */
  addRecord(record: ExecutionScore): void {
    this.records.push(record);
    if (this.records.length > this.windowSize) {
      this.records.shift();
    }
  }

  /**
   * Returns a copy of the current rolling window.
   */
  getWindow(): ExecutionScore[] {
    return [...this.records];
  }

  /**
   * Computes summary statistics for the current rolling window.
   */
  getStats(): WindowStats {
    const count = this.records.length;

    if (count === 0) {
      return { mean: 0, stddev: 0, min: 0, max: 0, count: 0 };
    }

    const scores = this.records.map((r) => r.compositeScore);

    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const min = Math.min(...scores);
    const max = Math.max(...scores);

    const squaredDiffs = scores.map((s) => (s - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stddev = Math.sqrt(variance);

    return { mean, stddev, min, max, count };
  }
}
