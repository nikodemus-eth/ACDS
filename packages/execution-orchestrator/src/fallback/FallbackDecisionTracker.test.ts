import { describe, it, expect } from 'vitest';
import { FallbackDecisionTracker } from './FallbackDecisionTracker.js';
import type { FallbackEntry } from '@acds/core-types';

function makeEntry(overrides: Partial<FallbackEntry> = {}): FallbackEntry {
  return {
    modelProfileId: 'model-2',
    tacticProfileId: 'tactic-2',
    providerId: 'provider-2',
    priority: 1,
    ...overrides,
  };
}

describe('FallbackDecisionTracker', () => {
  it('starts with no attempts for a given execution', () => {
    const tracker = new FallbackDecisionTracker();
    expect(tracker.getAttempts('exec-1')).toEqual([]);
  });

  it('recordAttempt adds an attempt with status attempted', () => {
    const tracker = new FallbackDecisionTracker();
    const entry = makeEntry();
    tracker.recordAttempt('exec-1', entry, 'Primary failed');

    const attempts = tracker.getAttempts('exec-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].executionId).toBe('exec-1');
    expect(attempts[0].entry).toBe(entry);
    expect(attempts[0].status).toBe('attempted');
    expect(attempts[0].reason).toBe('Primary failed');
    expect(attempts[0].timestamp).toBeInstanceOf(Date);
  });

  it('recordSuccess adds an attempt with status succeeded', () => {
    const tracker = new FallbackDecisionTracker();
    const entry = makeEntry();
    tracker.recordSuccess('exec-1', entry);

    const attempts = tracker.getAttempts('exec-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('succeeded');
    expect(attempts[0].reason).toBe('Fallback succeeded');
  });

  it('recordFailure adds an attempt with status failed', () => {
    const tracker = new FallbackDecisionTracker();
    const entry = makeEntry();
    tracker.recordFailure('exec-1', entry, 'Timeout');

    const attempts = tracker.getAttempts('exec-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('failed');
    expect(attempts[0].reason).toBe('Timeout');
  });

  it('tracks multiple attempts for the same execution', () => {
    const tracker = new FallbackDecisionTracker();
    const entry1 = makeEntry({ providerId: 'prov-a' });
    const entry2 = makeEntry({ providerId: 'prov-b' });

    tracker.recordAttempt('exec-1', entry1, 'Primary failed');
    tracker.recordFailure('exec-1', entry1, 'Also failed');
    tracker.recordAttempt('exec-1', entry2, 'Trying next');
    tracker.recordSuccess('exec-1', entry2);

    const attempts = tracker.getAttempts('exec-1');
    expect(attempts).toHaveLength(4);
    expect(attempts.map((a) => a.status)).toEqual(['attempted', 'failed', 'attempted', 'succeeded']);
  });

  it('filters attempts by executionId', () => {
    const tracker = new FallbackDecisionTracker();
    const entry = makeEntry();

    tracker.recordAttempt('exec-1', entry, 'reason-1');
    tracker.recordAttempt('exec-2', entry, 'reason-2');
    tracker.recordAttempt('exec-1', entry, 'reason-3');

    expect(tracker.getAttempts('exec-1')).toHaveLength(2);
    expect(tracker.getAttempts('exec-2')).toHaveLength(1);
    expect(tracker.getAttempts('exec-3')).toHaveLength(0);
  });
});
