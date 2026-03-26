import { describe, expect, it } from 'vitest';
import { isReleaseBlockingSnapshot } from './exitPolicy.js';
import type { IntegritySnapshot } from '@acds/grits';

function makeSnapshot(overrides: Partial<IntegritySnapshot> = {}): IntegritySnapshot {
  return {
    id: 'snap-1',
    cadence: 'release',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalDurationMs: 10,
    results: [],
    overallStatus: 'green',
    defectCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    ...overrides,
  };
}

describe('isReleaseBlockingSnapshot', () => {
  it('treats critical defects as blocking', () => {
    expect(isReleaseBlockingSnapshot(makeSnapshot({
      defectCount: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    }))).toBe(true);
  });

  it('treats high defects as blocking', () => {
    expect(isReleaseBlockingSnapshot(makeSnapshot({
      defectCount: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    }))).toBe(true);
  });

  it('allows non-blocking green snapshots', () => {
    expect(isReleaseBlockingSnapshot(makeSnapshot({
      defectCount: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
    }))).toBe(false);
  });
});
