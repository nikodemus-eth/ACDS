import type {
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  IntegritySnapshot,
  OverallStatus,
  DefectCounts,
} from '@acds/grits';

let snapshotCounter = 0;

function generateSnapshotId(): string {
  return `snap-${Date.now()}-${++snapshotCounter}`;
}

/**
 * Builds an IntegritySnapshot from an array of CheckerResults.
 */
export function buildSnapshot(
  cadence: Cadence,
  results: CheckerResult[],
  startedAt: string,
): IntegritySnapshot {
  const completedAt = new Date().toISOString();
  const startTime = new Date(startedAt).getTime();
  const endTime = new Date(completedAt).getTime();

  const allInvariants: InvariantCheckResult[] = results.flatMap(
    (r) => r.invariants,
  );

  const overallStatus = deriveOverallStatus(allInvariants);
  const defectCount = rollUpDefectCounts(allInvariants);

  return {
    id: generateSnapshotId(),
    cadence,
    startedAt,
    completedAt,
    totalDurationMs: endTime - startTime,
    results: allInvariants,
    overallStatus,
    defectCount,
  };
}

function deriveOverallStatus(results: InvariantCheckResult[]): OverallStatus {
  const hasFailure = results.some((r) => r.status === 'fail');
  if (hasFailure) return 'red';

  const hasWarning = results.some((r) => r.status === 'warn');
  if (hasWarning) return 'yellow';

  return 'green';
}

function rollUpDefectCounts(results: InvariantCheckResult[]): DefectCounts {
  const counts: DefectCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const result of results) {
    for (const defect of result.defects) {
      counts[defect.severity]++;
    }
  }

  return counts;
}
