import type {
  Cadence,
  IntegrityChecker,
  CheckerResult,
  IntegritySnapshot,
  InvariantCheckResult,
} from '@acds/grits';
import { buildSnapshot } from './SnapshotBuilder.js';

/**
 * Orchestrates integrity checkers for a given cadence.
 *
 * Filters checkers to those that support the cadence, runs them
 * with error isolation (checker failure → skip, not crash), and
 * builds an IntegritySnapshot from the combined results.
 */
export async function runIntegrityChecks(
  checkers: IntegrityChecker[],
  cadence: Cadence,
): Promise<IntegritySnapshot> {
  const startedAt = new Date().toISOString();

  const eligible = checkers.filter((c) =>
    c.supportedCadences.includes(cadence),
  );

  console.log(
    `[grits-engine] Running ${eligible.length}/${checkers.length} checker(s) for cadence "${cadence}"`,
  );

  const results: CheckerResult[] = [];

  for (const checker of eligible) {
    try {
      const result = await checker.check(cadence);
      results.push(result);
      const defectCount = result.invariants.reduce(
        (sum, inv) => sum + inv.defects.length,
        0,
      );
      console.log(
        `[grits-engine] ${checker.name}: ${result.invariants.length} invariant(s), ${defectCount} defect(s)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[grits-engine] ${checker.name} failed: ${message}`,
      );

      // Error isolation: produce skip results for this checker's invariants
      const skipResults: InvariantCheckResult[] = checker.invariantIds.map(
        (invariantId) => ({
          invariantId,
          status: 'skip' as const,
          checkedAt: new Date().toISOString(),
          durationMs: 0,
          sampleSize: 0,
          defects: [],
          summary: `Skipped due to checker error: ${message}`,
        }),
      );

      results.push({
        checkerName: checker.name,
        cadence,
        invariants: skipResults,
      });
    }
  }

  return buildSnapshot(cadence, results, startedAt);
}
