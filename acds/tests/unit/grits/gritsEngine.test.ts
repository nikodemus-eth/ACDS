import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../../../apps/grits-worker/src/engine/SnapshotBuilder.js';
import { analyzeDrift } from '../../../apps/grits-worker/src/engine/DriftAnalyzer.js';
import { runIntegrityChecks } from '../../../apps/grits-worker/src/engine/IntegrityEngine.js';
import type {
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  IntegritySnapshot,
  IntegrityChecker,
  InvariantId,
  DefectReport,
} from '@acds/grits';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefect(overrides: Partial<DefectReport> = {}): DefectReport {
  return {
    id: overrides.id ?? `defect-${Math.random().toString(36).slice(2, 8)}`,
    invariantId: overrides.invariantId ?? 'INV-001',
    severity: overrides.severity ?? 'high',
    title: overrides.title ?? 'Test defect',
    description: overrides.description ?? 'A test defect for unit testing',
    evidence: overrides.evidence ?? {},
    resourceType: overrides.resourceType ?? 'execution',
    resourceId: overrides.resourceId ?? 'exec-1',
    detectedAt: overrides.detectedAt ?? new Date().toISOString(),
  };
}

function makeInvariantResult(
  overrides: Partial<InvariantCheckResult> = {},
): InvariantCheckResult {
  return {
    invariantId: overrides.invariantId ?? 'INV-001',
    status: overrides.status ?? 'pass',
    checkedAt: overrides.checkedAt ?? new Date().toISOString(),
    durationMs: overrides.durationMs ?? 10,
    sampleSize: overrides.sampleSize ?? 100,
    defects: overrides.defects ?? [],
    summary: overrides.summary ?? 'OK',
  };
}

function makeCheckerResult(
  overrides: Partial<CheckerResult> = {},
): CheckerResult {
  return {
    checkerName: overrides.checkerName ?? 'TestChecker',
    cadence: overrides.cadence ?? 'fast',
    invariants: overrides.invariants ?? [makeInvariantResult()],
  };
}

function makeSnapshot(
  overrides: Partial<IntegritySnapshot> = {},
): IntegritySnapshot {
  return {
    id: overrides.id ?? `snap-test-${Math.random().toString(36).slice(2, 8)}`,
    cadence: overrides.cadence ?? 'fast',
    startedAt: overrides.startedAt ?? '2026-03-15T00:00:00.000Z',
    completedAt: overrides.completedAt ?? '2026-03-15T00:00:01.000Z',
    totalDurationMs: overrides.totalDurationMs ?? 1000,
    results: overrides.results ?? [],
    overallStatus: overrides.overallStatus ?? 'green',
    defectCount: overrides.defectCount ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

function makeMockChecker(overrides: {
  name?: string;
  invariantIds?: InvariantId[];
  supportedCadences?: Cadence[];
  checkFn?: (cadence: Cadence) => Promise<CheckerResult>;
}): IntegrityChecker {
  const name = overrides.name ?? 'MockChecker';
  const invariantIds = overrides.invariantIds ?? ['INV-001'];
  const supportedCadences = overrides.supportedCadences ?? ['fast'];
  const checkFn =
    overrides.checkFn ??
    (async (cadence: Cadence) =>
      makeCheckerResult({
        checkerName: name,
        cadence,
        invariants: invariantIds.map((id) =>
          makeInvariantResult({ invariantId: id }),
        ),
      }));

  return {
    name,
    invariantIds,
    supportedCadences,
    check: checkFn,
  };
}

// ---------------------------------------------------------------------------
// SnapshotBuilder
// ---------------------------------------------------------------------------

describe('SnapshotBuilder', () => {
  describe('buildSnapshot', () => {
    it('returns green status when all invariants pass', () => {
      const results: CheckerResult[] = [
        makeCheckerResult({
          invariants: [
            makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
            makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),
          ],
        }),
      ];

      const snapshot = buildSnapshot('fast', results, '2026-03-15T00:00:00.000Z');

      expect(snapshot.overallStatus).toBe('green');
    });

    it('returns yellow status when some invariants warn but none fail', () => {
      const results: CheckerResult[] = [
        makeCheckerResult({
          invariants: [
            makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
            makeInvariantResult({ invariantId: 'INV-002', status: 'warn' }),
          ],
        }),
      ];

      const snapshot = buildSnapshot('fast', results, '2026-03-15T00:00:00.000Z');

      expect(snapshot.overallStatus).toBe('yellow');
    });

    it('returns red status when any invariant fails', () => {
      const results: CheckerResult[] = [
        makeCheckerResult({
          invariants: [
            makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
            makeInvariantResult({ invariantId: 'INV-002', status: 'fail' }),
            makeInvariantResult({ invariantId: 'INV-003', status: 'warn' }),
          ],
        }),
      ];

      const snapshot = buildSnapshot('fast', results, '2026-03-15T00:00:00.000Z');

      expect(snapshot.overallStatus).toBe('red');
    });

    it('rolls up defect counts across multiple checker results', () => {
      const results: CheckerResult[] = [
        makeCheckerResult({
          checkerName: 'Checker-A',
          invariants: [
            makeInvariantResult({
              invariantId: 'INV-001',
              status: 'fail',
              defects: [
                makeDefect({ severity: 'critical' }),
                makeDefect({ severity: 'high' }),
              ],
            }),
          ],
        }),
        makeCheckerResult({
          checkerName: 'Checker-B',
          invariants: [
            makeInvariantResult({
              invariantId: 'INV-003',
              status: 'fail',
              defects: [
                makeDefect({ severity: 'medium' }),
                makeDefect({ severity: 'low' }),
                makeDefect({ severity: 'info' }),
              ],
            }),
          ],
        }),
      ];

      const snapshot = buildSnapshot('daily', results, '2026-03-15T00:00:00.000Z');

      expect(snapshot.defectCount).toEqual({
        critical: 1,
        high: 1,
        medium: 1,
        low: 1,
        info: 1,
      });
    });

    it('returns green with zero defect counts for empty results array', () => {
      const snapshot = buildSnapshot('fast', [], '2026-03-15T00:00:00.000Z');

      expect(snapshot.overallStatus).toBe('green');
      expect(snapshot.defectCount).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      });
      expect(snapshot.results).toEqual([]);
    });

    it('flattens results from all checkers into snapshot.results', () => {
      const inv1 = makeInvariantResult({ invariantId: 'INV-001' });
      const inv2 = makeInvariantResult({ invariantId: 'INV-002' });
      const inv3 = makeInvariantResult({ invariantId: 'INV-003' });

      const results: CheckerResult[] = [
        makeCheckerResult({ checkerName: 'A', invariants: [inv1, inv2] }),
        makeCheckerResult({ checkerName: 'B', invariants: [inv3] }),
      ];

      const snapshot = buildSnapshot('fast', results, '2026-03-15T00:00:00.000Z');

      expect(snapshot.results).toHaveLength(3);
      expect(snapshot.results.map((r) => r.invariantId)).toEqual([
        'INV-001',
        'INV-002',
        'INV-003',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// DriftAnalyzer
// ---------------------------------------------------------------------------

describe('DriftAnalyzer', () => {
  describe('analyzeDrift', () => {
    it('reports unchanged when both snapshots have same invariant statuses', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'pass' })],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'pass' })],
      });

      const report = analyzeDrift(previous, current);

      expect(report.drifts).toHaveLength(1);
      expect(report.drifts[0].direction).toBe('unchanged');
      expect(report.netDirection).toBe('unchanged');
    });

    it('reports improved when invariant goes from fail to pass', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'fail' })],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'pass' })],
      });

      const report = analyzeDrift(previous, current);

      expect(report.drifts[0].direction).toBe('improved');
      expect(report.netDirection).toBe('improved');
    });

    it('reports degraded when invariant goes from pass to fail', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'pass' })],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [makeInvariantResult({ invariantId: 'INV-001', status: 'fail' })],
      });

      const report = analyzeDrift(previous, current);

      expect(report.drifts[0].direction).toBe('degraded');
      expect(report.netDirection).toBe('degraded');
    });

    it('handles mixed directions across multiple invariants', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'fail' }),
          makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),
          makeInvariantResult({ invariantId: 'INV-003', status: 'warn' }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),   // improved
          makeInvariantResult({ invariantId: 'INV-002', status: 'fail' }),   // degraded
          makeInvariantResult({ invariantId: 'INV-003', status: 'warn' }),   // unchanged
        ],
      });

      const report = analyzeDrift(previous, current);

      const driftMap = new Map(report.drifts.map((d) => [d.invariantId, d]));
      expect(driftMap.get('INV-001')!.direction).toBe('improved');
      expect(driftMap.get('INV-002')!.direction).toBe('degraded');
      expect(driftMap.get('INV-003')!.direction).toBe('unchanged');
    });

    it('reports improved net direction when more improved than degraded', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'fail' }),
          makeInvariantResult({ invariantId: 'INV-002', status: 'fail' }),
          makeInvariantResult({ invariantId: 'INV-003', status: 'pass' }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),   // improved
          makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),   // improved
          makeInvariantResult({ invariantId: 'INV-003', status: 'fail' }),   // degraded
        ],
      });

      const report = analyzeDrift(previous, current);

      expect(report.netDirection).toBe('improved');
    });

    it('reports unchanged net direction when equal improved and degraded', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'fail' }),
          makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),   // improved
          makeInvariantResult({ invariantId: 'INV-002', status: 'fail' }),   // degraded
        ],
      });

      const report = analyzeDrift(previous, current);

      expect(report.netDirection).toBe('unchanged');
    });

    it('detects new defects present in current but not in previous', () => {
      const sharedDefect = makeDefect({ id: 'shared-1', invariantId: 'INV-001' });
      const newDefect = makeDefect({ id: 'new-1', invariantId: 'INV-001' });

      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({
            invariantId: 'INV-001',
            status: 'fail',
            defects: [sharedDefect],
          }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({
            invariantId: 'INV-001',
            status: 'fail',
            defects: [sharedDefect, newDefect],
          }),
        ],
      });

      const report = analyzeDrift(previous, current);

      expect(report.drifts[0].newDefects).toHaveLength(1);
      expect(report.drifts[0].newDefects[0].id).toBe('new-1');
    });

    it('detects resolved defects present in previous but not in current', () => {
      const resolvedDefect = makeDefect({ id: 'resolved-1', invariantId: 'INV-001' });

      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({
            invariantId: 'INV-001',
            status: 'fail',
            defects: [resolvedDefect],
          }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({
            invariantId: 'INV-001',
            status: 'pass',
            defects: [],
          }),
        ],
      });

      const report = analyzeDrift(previous, current);

      expect(report.drifts[0].resolvedDefects).toHaveLength(1);
      expect(report.drifts[0].resolvedDefects[0].id).toBe('resolved-1');
    });

    it('handles invariant present only in current snapshot (new invariant)', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
          makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),
        ],
      });

      const report = analyzeDrift(previous, current);

      const newDrift = report.drifts.find((d) => d.invariantId === 'INV-002');
      expect(newDrift).toBeDefined();
      expect(newDrift!.previousStatus).toBe('skip');
      expect(newDrift!.currentStatus).toBe('pass');
      expect(newDrift!.direction).toBe('improved');
    });

    it('handles invariant present only in previous snapshot (removed invariant)', () => {
      const previous = makeSnapshot({
        id: 'snap-prev',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
          makeInvariantResult({ invariantId: 'INV-002', status: 'pass' }),
        ],
      });
      const current = makeSnapshot({
        id: 'snap-curr',
        results: [
          makeInvariantResult({ invariantId: 'INV-001', status: 'pass' }),
        ],
      });

      const report = analyzeDrift(previous, current);

      const removedDrift = report.drifts.find((d) => d.invariantId === 'INV-002');
      expect(removedDrift).toBeDefined();
      expect(removedDrift!.previousStatus).toBe('pass');
      expect(removedDrift!.currentStatus).toBe('skip');
      expect(removedDrift!.direction).toBe('degraded');
    });
  });
});

// ---------------------------------------------------------------------------
// IntegrityEngine
// ---------------------------------------------------------------------------

describe('IntegrityEngine', () => {
  describe('runIntegrityChecks', () => {
    it('filters checkers to those supporting the given cadence', async () => {
      const fastChecker = makeMockChecker({
        name: 'FastOnly',
        invariantIds: ['INV-001'],
        supportedCadences: ['fast'],
      });
      const dailyChecker = makeMockChecker({
        name: 'DailyOnly',
        invariantIds: ['INV-002'],
        supportedCadences: ['daily'],
      });

      const snapshot = await runIntegrityChecks([fastChecker, dailyChecker], 'fast');

      const invariantIds = snapshot.results.map((r) => r.invariantId);
      expect(invariantIds).toContain('INV-001');
      expect(invariantIds).not.toContain('INV-002');
    });

    it('produces snapshot with results from eligible checkers only', async () => {
      const checkerA = makeMockChecker({
        name: 'CheckerA',
        invariantIds: ['INV-001'],
        supportedCadences: ['daily', 'fast'],
      });
      const checkerB = makeMockChecker({
        name: 'CheckerB',
        invariantIds: ['INV-003'],
        supportedCadences: ['daily'],
      });

      const snapshot = await runIntegrityChecks([checkerA, checkerB], 'daily');

      expect(snapshot.results).toHaveLength(2);
      expect(snapshot.cadence).toBe('daily');
      expect(snapshot.overallStatus).toBe('green');
    });

    it('isolates errors: checker that throws produces skip status without crashing', async () => {
      const goodChecker = makeMockChecker({
        name: 'GoodChecker',
        invariantIds: ['INV-001'],
        supportedCadences: ['fast'],
      });
      const failingChecker = makeMockChecker({
        name: 'FailingChecker',
        invariantIds: ['INV-002', 'INV-003'],
        supportedCadences: ['fast'],
        checkFn: async () => {
          throw new Error('Database connection lost');
        },
      });

      const snapshot = await runIntegrityChecks(
        [goodChecker, failingChecker],
        'fast',
      );

      expect(snapshot.results).toHaveLength(3); // 1 from good + 2 skip from failing
      const goodResult = snapshot.results.find((r) => r.invariantId === 'INV-001');
      expect(goodResult!.status).toBe('pass');

      const skipped = snapshot.results.filter((r) => r.status === 'skip');
      expect(skipped).toHaveLength(2);
      expect(skipped.map((s) => s.invariantId).sort()).toEqual(['INV-002', 'INV-003']);
      expect(skipped[0].summary).toContain('Database connection lost');
    });

    it('handles all checkers failing gracefully, producing skip results', async () => {
      const badA = makeMockChecker({
        name: 'BadA',
        invariantIds: ['INV-001'],
        supportedCadences: ['fast'],
        checkFn: async () => {
          throw new Error('Timeout');
        },
      });
      const badB = makeMockChecker({
        name: 'BadB',
        invariantIds: ['INV-004'],
        supportedCadences: ['fast'],
        checkFn: async () => {
          throw new Error('Out of memory');
        },
      });

      const snapshot = await runIntegrityChecks([badA, badB], 'fast');

      expect(snapshot.results).toHaveLength(2);
      expect(snapshot.results.every((r) => r.status === 'skip')).toBe(true);
      expect(snapshot.overallStatus).toBe('green'); // skip does not trigger yellow/red
      expect(snapshot.defectCount).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      });
    });
  });
});
