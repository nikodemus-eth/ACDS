/**
 * LatencyMetric - Evaluates execution latency, normalized to a 0-1 score
 * where lower latency yields a higher score.
 */

import type { MetricResult } from './AcceptanceMetric.js';

export interface LatencyRecord {
  /** Latency in milliseconds. */
  latencyMs: number | null;
}

export interface LatencyThresholds {
  /** Latency at or below which the score is 1.0 (in ms). Default: 500. */
  idealMs: number;
  /** Latency at or above which the score is 0.0 (in ms). Default: 10000. */
  maxMs: number;
}

const DEFAULT_THRESHOLDS: LatencyThresholds = {
  idealMs: 500,
  maxMs: 10_000,
};

/**
 * Evaluates latency of an execution record, normalized to a 0-1 score.
 *
 * @param record - A record containing latencyMs.
 * @param thresholds - Optional configurable thresholds for ideal and max latency.
 * @returns A MetricResult with a linearly interpolated score between 0.0 and 1.0.
 */
export function evaluateLatency(
  record: LatencyRecord,
  thresholds: Partial<LatencyThresholds> = {},
): MetricResult {
  const { idealMs, maxMs } = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (record.latencyMs === null || record.latencyMs === undefined) {
    return {
      score: 0.0,
      label: 'latency',
      details: {
        latencyMs: null,
        reason: 'No latency data available',
        idealMs,
        maxMs,
      },
    };
  }

  let score: number;
  if (record.latencyMs <= idealMs) {
    score = 1.0;
  } else if (record.latencyMs >= maxMs) {
    score = 0.0;
  } else {
    score = 1.0 - (record.latencyMs - idealMs) / (maxMs - idealMs);
  }

  return {
    score,
    label: 'latency',
    details: {
      latencyMs: record.latencyMs,
      idealMs,
      maxMs,
    },
  };
}
