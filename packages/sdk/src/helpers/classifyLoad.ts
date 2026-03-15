import { LoadTier } from '@acds/core-types';

/**
 * Thresholds for classifying complexity / token count into a {@link LoadTier}.
 *
 * - SIMPLE:   value <= lowThreshold
 * - MODERATE: lowThreshold < value <= highThreshold
 * - COMPLEX:  value > highThreshold
 */
export interface LoadClassificationThresholds {
  /** Upper bound for SIMPLE (inclusive). Default 1 000. */
  lowThreshold?: number;
  /** Upper bound for MODERATE (inclusive). Default 8 000. */
  highThreshold?: number;
}

const DEFAULT_LOW = 1_000;
const DEFAULT_HIGH = 8_000;

/**
 * Classify a numeric complexity score or token count into a {@link LoadTier}.
 *
 * @param value - A non-negative number representing complexity or token count.
 * @param thresholds - Optional custom thresholds.
 * @returns The corresponding {@link LoadTier}.
 */
export function classifyLoad(
  value: number,
  thresholds: LoadClassificationThresholds = {},
): LoadTier {
  const low = thresholds.lowThreshold ?? DEFAULT_LOW;
  const high = thresholds.highThreshold ?? DEFAULT_HIGH;

  if (value <= low) return LoadTier.SIMPLE;
  if (value <= high) return LoadTier.MODERATE;
  return LoadTier.COMPLEX;
}
