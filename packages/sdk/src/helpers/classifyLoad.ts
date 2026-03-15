import { LoadTier } from '@acds/core-types';

/**
 * Options for determining the {@link LoadTier} based on interaction pattern.
 *
 * - SINGLE_SHOT: One request, one response. Default for most use cases.
 * - BATCH: Multiple items processed in a single request.
 * - STREAMING: Real-time / SSE token-by-token delivery.
 * - HIGH_THROUGHPUT: Large-scale parallel processing (many concurrent requests).
 */
export interface LoadClassificationOptions {
  /** Number of items to process in this request. Default: 1. */
  itemCount?: number;
  /** Whether the response should be streamed token-by-token. */
  streaming?: boolean;
  /** Expected concurrent requests for this workload. Default: 1. */
  concurrency?: number;
  /** Threshold above which itemCount is considered batch. Default: 1. */
  batchThreshold?: number;
  /** Threshold above which concurrency is considered high-throughput. Default: 10. */
  highThroughputThreshold?: number;
}

/**
 * Classify an interaction pattern into a {@link LoadTier}.
 *
 * @param options - Describes the interaction pattern.
 * @returns The corresponding {@link LoadTier}.
 */
export function classifyLoad(options: LoadClassificationOptions = {}): LoadTier {
  const {
    itemCount = 1,
    streaming = false,
    concurrency = 1,
    batchThreshold = 1,
    highThroughputThreshold = 10,
  } = options;

  if (streaming) return LoadTier.STREAMING;
  if (concurrency >= highThroughputThreshold) return LoadTier.HIGH_THROUGHPUT;
  if (itemCount > batchThreshold) return LoadTier.BATCH;
  return LoadTier.SINGLE_SHOT;
}
