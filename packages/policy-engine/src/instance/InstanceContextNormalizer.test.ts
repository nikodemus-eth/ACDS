import { describe, it, expect } from 'vitest';
import { normalizeInstanceContext } from './InstanceContextNormalizer.js';

describe('normalizeInstanceContext', () => {
  it('returns defaults when called with undefined', () => {
    const result = normalizeInstanceContext(undefined);
    expect(result).toEqual({
      retryCount: 0,
      previousFailures: [],
      deadlinePressure: false,
      humanReviewStatus: 'none',
      additionalMetadata: {},
    });
  });

  it('returns defaults when called with no argument', () => {
    const result = normalizeInstanceContext();
    expect(result.retryCount).toBe(0);
    expect(result.previousFailures).toEqual([]);
    expect(result.deadlinePressure).toBe(false);
    expect(result.humanReviewStatus).toBe('none');
    expect(result.additionalMetadata).toEqual({});
  });

  it('preserves provided retryCount', () => {
    const result = normalizeInstanceContext({ retryCount: 5, previousFailures: [], deadlinePressure: false, humanReviewStatus: 'none', additionalMetadata: {} });
    expect(result.retryCount).toBe(5);
  });

  it('preserves provided previousFailures', () => {
    const failures = ['timeout', 'rate_limit'];
    const result = normalizeInstanceContext({ retryCount: 0, previousFailures: failures, deadlinePressure: false, humanReviewStatus: 'none', additionalMetadata: {} });
    expect(result.previousFailures).toEqual(failures);
  });

  it('preserves deadlinePressure when true', () => {
    const result = normalizeInstanceContext({ retryCount: 0, previousFailures: [], deadlinePressure: true, humanReviewStatus: 'none', additionalMetadata: {} });
    expect(result.deadlinePressure).toBe(true);
  });

  it('preserves humanReviewStatus pending', () => {
    const result = normalizeInstanceContext({ retryCount: 0, previousFailures: [], deadlinePressure: false, humanReviewStatus: 'pending', additionalMetadata: {} });
    expect(result.humanReviewStatus).toBe('pending');
  });

  it('preserves humanReviewStatus completed', () => {
    const result = normalizeInstanceContext({ retryCount: 0, previousFailures: [], deadlinePressure: false, humanReviewStatus: 'completed', additionalMetadata: {} });
    expect(result.humanReviewStatus).toBe('completed');
  });

  it('preserves additionalMetadata', () => {
    const meta = { traceId: 'abc', nested: { x: 1 } };
    const result = normalizeInstanceContext({ retryCount: 0, previousFailures: [], deadlinePressure: false, humanReviewStatus: 'none', additionalMetadata: meta });
    expect(result.additionalMetadata).toEqual(meta);
  });

  it('fills in missing fields from partial context', () => {
    // Cast to simulate a raw context with some fields missing
    const partial = { retryCount: 2 } as any;
    const result = normalizeInstanceContext(partial);
    expect(result.retryCount).toBe(2);
    expect(result.previousFailures).toEqual([]);
    expect(result.deadlinePressure).toBe(false);
    expect(result.humanReviewStatus).toBe('none');
    expect(result.additionalMetadata).toEqual({});
  });
});
