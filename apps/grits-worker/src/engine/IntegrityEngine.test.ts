import { describe, it, expect } from 'vitest';
import { runIntegrityChecks } from './IntegrityEngine.js';
import type { IntegrityChecker, Cadence, CheckerResult, InvariantId } from '@acds/grits';

function makeChecker(options: {
  name?: string;
  invariantIds?: InvariantId[];
  cadences?: Cadence[];
  result?: CheckerResult;
  throwError?: Error;
} = {}): IntegrityChecker {
  const name = options.name ?? 'TestChecker';
  const invariantIds = options.invariantIds ?? ['INV-001' as InvariantId];
  return {
    name,
    invariantIds,
    supportedCadences: options.cadences ?? ['fast', 'daily', 'release'],
    async check(cadence: Cadence): Promise<CheckerResult> {
      if (options.throwError) throw options.throwError;
      return options.result ?? {
        checkerName: name,
        cadence,
        invariants: invariantIds.map(id => ({
          invariantId: id,
          status: 'pass' as const,
          checkedAt: new Date().toISOString(),
          durationMs: 5,
          sampleSize: 1,
          defects: [],
          summary: 'OK',
        })),
      };
    },
  };
}

describe('runIntegrityChecks', () => {
  it('runs all eligible checkers for given cadence', async () => {
    const checker1 = makeChecker({ name: 'C1', invariantIds: ['INV-001' as any] });
    const checker2 = makeChecker({ name: 'C2', invariantIds: ['INV-002' as any] });

    const snapshot = await runIntegrityChecks([checker1, checker2], 'daily');

    expect(snapshot.cadence).toBe('daily');
    expect(snapshot.results).toHaveLength(2);
    expect(snapshot.overallStatus).toBe('green');
  });

  it('filters checkers by supported cadence', async () => {
    const fastOnly = makeChecker({ name: 'FastOnly', cadences: ['fast'], invariantIds: ['INV-001' as any] });
    const dailyOnly = makeChecker({ name: 'DailyOnly', cadences: ['daily'], invariantIds: ['INV-002' as any] });

    const snapshot = await runIntegrityChecks([fastOnly, dailyOnly], 'daily');

    // Only DailyOnly should run
    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.results[0].invariantId).toBe('INV-002');
  });

  it('isolates checker errors with skip results', async () => {
    const good = makeChecker({ name: 'Good', invariantIds: ['INV-001' as any] });
    const bad = makeChecker({
      name: 'Bad',
      invariantIds: ['INV-002' as any, 'INV-003' as any],
      throwError: new Error('checker crash'),
    });

    const snapshot = await runIntegrityChecks([good, bad], 'daily');

    expect(snapshot.results).toHaveLength(3); // 1 pass + 2 skip
    const skipResults = snapshot.results.filter(r => r.status === 'skip');
    expect(skipResults).toHaveLength(2);
    expect(skipResults[0].summary).toContain('checker crash');
  });

  it('handles all checkers failing', async () => {
    const bad = makeChecker({
      name: 'Bad',
      invariantIds: ['INV-001' as any],
      throwError: new Error('total failure'),
    });

    const snapshot = await runIntegrityChecks([bad], 'daily');

    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.results[0].status).toBe('skip');
  });

  it('returns empty results when no checkers match cadence', async () => {
    const releaseOnly = makeChecker({ cadences: ['release'] });

    const snapshot = await runIntegrityChecks([releaseOnly], 'fast');

    expect(snapshot.results).toHaveLength(0);
    expect(snapshot.overallStatus).toBe('green');
  });

  it('returns empty results when no checkers provided', async () => {
    const snapshot = await runIntegrityChecks([], 'daily');

    expect(snapshot.results).toHaveLength(0);
    expect(snapshot.overallStatus).toBe('green');
  });

  it('correctly aggregates defects from multiple checkers', async () => {
    const checker = makeChecker({
      result: {
        checkerName: 'WithDefects',
        cadence: 'daily',
        invariants: [{
          invariantId: 'INV-001' as any,
          status: 'fail',
          checkedAt: new Date().toISOString(),
          durationMs: 5,
          sampleSize: 1,
          defects: [{
            id: 'd1',
            invariantId: 'INV-001' as any,
            severity: 'critical',
            title: 'bad',
            description: 'really bad',
            evidence: {},
            resourceType: 'execution',
            resourceId: 'e1',
            detectedAt: new Date().toISOString(),
          }],
          summary: 'Found issues',
        }],
      },
    });

    const snapshot = await runIntegrityChecks([checker], 'daily');

    expect(snapshot.overallStatus).toBe('red');
    expect(snapshot.defectCount.critical).toBe(1);
  });
});
