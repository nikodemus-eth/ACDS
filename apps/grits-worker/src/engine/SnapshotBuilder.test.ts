import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './SnapshotBuilder.js';
import type { CheckerResult, InvariantCheckResult } from '@acds/grits';

function makeInvariant(overrides: Partial<InvariantCheckResult> = {}): InvariantCheckResult {
  return {
    invariantId: 'INV-001' as any,
    status: 'pass',
    checkedAt: new Date().toISOString(),
    durationMs: 10,
    sampleSize: 5,
    defects: [],
    summary: 'All good',
    ...overrides,
  };
}

function makeResult(overrides: Partial<CheckerResult> = {}): CheckerResult {
  return {
    checkerName: 'TestChecker',
    cadence: 'daily',
    invariants: [makeInvariant()],
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('produces a valid snapshot with green status when all pass', () => {
    const startedAt = new Date().toISOString();
    const snapshot = buildSnapshot('daily', [makeResult()], startedAt);

    expect(snapshot.id).toContain('snap-');
    expect(snapshot.cadence).toBe('daily');
    expect(snapshot.startedAt).toBe(startedAt);
    expect(snapshot.completedAt).toBeDefined();
    expect(snapshot.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.overallStatus).toBe('green');
    expect(snapshot.defectCount).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('returns red status when any invariant fails', () => {
    const snapshot = buildSnapshot('daily', [
      makeResult({ invariants: [makeInvariant({ status: 'fail' })] }),
    ], new Date().toISOString());

    expect(snapshot.overallStatus).toBe('red');
  });

  it('returns yellow status when invariant warns but none fail', () => {
    const snapshot = buildSnapshot('daily', [
      makeResult({ invariants: [makeInvariant({ status: 'warn' })] }),
    ], new Date().toISOString());

    expect(snapshot.overallStatus).toBe('yellow');
  });

  it('prefers red over yellow when both present', () => {
    const snapshot = buildSnapshot('daily', [
      makeResult({
        invariants: [
          makeInvariant({ status: 'warn', invariantId: 'INV-001' as any }),
          makeInvariant({ status: 'fail', invariantId: 'INV-002' as any }),
        ],
      }),
    ], new Date().toISOString());

    expect(snapshot.overallStatus).toBe('red');
  });

  it('counts defects by severity', () => {
    const snapshot = buildSnapshot('daily', [
      makeResult({
        invariants: [
          makeInvariant({
            defects: [
              { id: 'd1', invariantId: 'INV-001' as any, severity: 'critical', title: 'x', description: 'x', evidence: {}, resourceType: 'exec', resourceId: 'e1', detectedAt: '' },
              { id: 'd2', invariantId: 'INV-001' as any, severity: 'high', title: 'x', description: 'x', evidence: {}, resourceType: 'exec', resourceId: 'e2', detectedAt: '' },
              { id: 'd3', invariantId: 'INV-001' as any, severity: 'medium', title: 'x', description: 'x', evidence: {}, resourceType: 'exec', resourceId: 'e3', detectedAt: '' },
              { id: 'd4', invariantId: 'INV-001' as any, severity: 'low', title: 'x', description: 'x', evidence: {}, resourceType: 'exec', resourceId: 'e4', detectedAt: '' },
              { id: 'd5', invariantId: 'INV-001' as any, severity: 'info', title: 'x', description: 'x', evidence: {}, resourceType: 'exec', resourceId: 'e5', detectedAt: '' },
            ],
          }),
        ],
      }),
    ], new Date().toISOString());

    expect(snapshot.defectCount.critical).toBe(1);
    expect(snapshot.defectCount.high).toBe(1);
    expect(snapshot.defectCount.medium).toBe(1);
    expect(snapshot.defectCount.low).toBe(1);
    expect(snapshot.defectCount.info).toBe(1);
  });

  it('flattens invariants from multiple results', () => {
    const snapshot = buildSnapshot('daily', [
      makeResult({ invariants: [makeInvariant({ invariantId: 'INV-001' as any })] }),
      makeResult({ invariants: [makeInvariant({ invariantId: 'INV-002' as any })] }),
    ], new Date().toISOString());

    expect(snapshot.results).toHaveLength(2);
  });

  it('handles empty results', () => {
    const snapshot = buildSnapshot('fast', [], new Date().toISOString());

    expect(snapshot.results).toHaveLength(0);
    expect(snapshot.overallStatus).toBe('green');
    expect(snapshot.defectCount).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('generates unique snapshot IDs', () => {
    const s1 = buildSnapshot('daily', [], new Date().toISOString());
    const s2 = buildSnapshot('daily', [], new Date().toISOString());
    expect(s1.id).not.toBe(s2.id);
  });
});
