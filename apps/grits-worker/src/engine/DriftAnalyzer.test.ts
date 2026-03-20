import { describe, it, expect } from 'vitest';
import { analyzeDrift } from './DriftAnalyzer.js';
import type { IntegritySnapshot, InvariantCheckResult, DefectReport } from '@acds/grits';

function makeDefect(id: string, invariantId = 'INV-001' as any): DefectReport {
  return {
    id,
    invariantId,
    severity: 'high',
    title: `Defect ${id}`,
    description: `Description for ${id}`,
    evidence: {},
    resourceType: 'execution',
    resourceId: `r-${id}`,
    detectedAt: new Date().toISOString(),
  };
}

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

function makeSnapshot(results: InvariantCheckResult[], id = 'snap-1'): IntegritySnapshot {
  return {
    id,
    cadence: 'daily',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalDurationMs: 100,
    results,
    overallStatus: 'green',
    defectCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };
}

describe('analyzeDrift', () => {
  it('reports unchanged when both snapshots are identical', () => {
    const inv = makeInvariant({ invariantId: 'INV-001' as any });
    const prev = makeSnapshot([inv], 'snap-1');
    const curr = makeSnapshot([inv], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.previousSnapshotId).toBe('snap-1');
    expect(report.currentSnapshotId).toBe('snap-2');
    expect(report.netDirection).toBe('unchanged');
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].direction).toBe('unchanged');
  });

  it('detects improvement when invariant goes from fail to pass', () => {
    const prev = makeSnapshot([makeInvariant({ status: 'fail' })], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ status: 'pass' })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.drifts[0].direction).toBe('improved');
    expect(report.netDirection).toBe('improved');
  });

  it('detects degradation when invariant goes from pass to fail', () => {
    const prev = makeSnapshot([makeInvariant({ status: 'pass' })], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ status: 'fail' })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.drifts[0].direction).toBe('degraded');
    expect(report.netDirection).toBe('degraded');
  });

  it('handles new invariants in current snapshot', () => {
    const prev = makeSnapshot([makeInvariant({ invariantId: 'INV-001' as any })], 'snap-1');
    const curr = makeSnapshot([
      makeInvariant({ invariantId: 'INV-001' as any }),
      makeInvariant({ invariantId: 'INV-002' as any }),
    ], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.drifts).toHaveLength(2);
    const inv2 = report.drifts.find(d => d.invariantId === 'INV-002');
    expect(inv2).toBeDefined();
    expect(inv2!.previousStatus).toBe('skip');
    expect(inv2!.currentStatus).toBe('pass');
    expect(inv2!.direction).toBe('improved'); // skip -> pass is improvement
  });

  it('handles removed invariants in current snapshot', () => {
    const prev = makeSnapshot([
      makeInvariant({ invariantId: 'INV-001' as any }),
      makeInvariant({ invariantId: 'INV-002' as any }),
    ], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ invariantId: 'INV-001' as any })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    const inv2 = report.drifts.find(d => d.invariantId === 'INV-002');
    expect(inv2).toBeDefined();
    expect(inv2!.currentStatus).toBe('skip');
  });

  it('tracks new and resolved defects', () => {
    const defect1 = makeDefect('d1');
    const defect2 = makeDefect('d2');
    const defect3 = makeDefect('d3');

    const prev = makeSnapshot([makeInvariant({ defects: [defect1, defect2] })], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ defects: [defect2, defect3] })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    const drift = report.drifts[0];
    expect(drift.newDefects).toHaveLength(1);
    expect(drift.newDefects[0].id).toBe('d3');
    expect(drift.resolvedDefects).toHaveLength(1);
    expect(drift.resolvedDefects[0].id).toBe('d1');
  });

  it('net direction is unchanged when improvements equal degradations', () => {
    const prev = makeSnapshot([
      makeInvariant({ invariantId: 'INV-001' as any, status: 'pass' }),
      makeInvariant({ invariantId: 'INV-002' as any, status: 'fail' }),
    ], 'snap-1');
    const curr = makeSnapshot([
      makeInvariant({ invariantId: 'INV-001' as any, status: 'fail' }),
      makeInvariant({ invariantId: 'INV-002' as any, status: 'pass' }),
    ], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.netDirection).toBe('unchanged');
  });

  it('handles warn to pass transition as improvement', () => {
    const prev = makeSnapshot([makeInvariant({ status: 'warn' })], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ status: 'pass' })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.drifts[0].direction).toBe('improved');
  });

  it('handles pass to warn transition as degradation', () => {
    const prev = makeSnapshot([makeInvariant({ status: 'pass' })], 'snap-1');
    const curr = makeSnapshot([makeInvariant({ status: 'warn' })], 'snap-2');

    const report = analyzeDrift(prev, curr);
    expect(report.drifts[0].direction).toBe('degraded');
  });

  it('generates unique drift report IDs', () => {
    const prev = makeSnapshot([], 'snap-1');
    const curr = makeSnapshot([], 'snap-2');
    const r1 = analyzeDrift(prev, curr);
    const r2 = analyzeDrift(prev, curr);
    expect(r1.id).not.toBe(r2.id);
  });

  it('has generatedAt timestamp', () => {
    const report = analyzeDrift(makeSnapshot([], 's1'), makeSnapshot([], 's2'));
    expect(report.generatedAt).toBeDefined();
    expect(new Date(report.generatedAt).getTime()).toBeGreaterThan(0);
  });
});
