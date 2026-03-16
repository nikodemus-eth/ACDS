import type {
  IntegritySnapshot,
  DriftReport,
  InvariantDrift,
  DriftDirection,
  InvariantCheckResult,
  CheckStatus,
  InvariantId,
} from '@acds/grits';

let driftCounter = 0;

function generateDriftId(): string {
  return `drift-${Date.now()}-${++driftCounter}`;
}

/**
 * Compares two IntegritySnapshots and produces a DriftReport.
 */
export function analyzeDrift(
  previous: IntegritySnapshot,
  current: IntegritySnapshot,
): DriftReport {
  const previousMap = new Map<InvariantId, InvariantCheckResult>();
  for (const r of previous.results) {
    previousMap.set(r.invariantId, r);
  }

  const currentMap = new Map<InvariantId, InvariantCheckResult>();
  for (const r of current.results) {
    currentMap.set(r.invariantId, r);
  }

  // Union of all invariant IDs from both snapshots
  const allIds = new Set<InvariantId>([
    ...previousMap.keys(),
    ...currentMap.keys(),
  ]);

  const drifts: InvariantDrift[] = [];

  for (const invariantId of allIds) {
    const prev = previousMap.get(invariantId);
    const curr = currentMap.get(invariantId);

    const previousStatus: CheckStatus = prev?.status ?? 'skip';
    const currentStatus: CheckStatus = curr?.status ?? 'skip';

    const direction = computeDirection(previousStatus, currentStatus);

    const previousDefectIds = new Set(
      prev?.defects.map((d) => d.id) ?? [],
    );
    const currentDefectIds = new Set(
      curr?.defects.map((d) => d.id) ?? [],
    );

    const newDefects = (curr?.defects ?? []).filter(
      (d) => !previousDefectIds.has(d.id),
    );
    const resolvedDefects = (prev?.defects ?? []).filter(
      (d) => !currentDefectIds.has(d.id),
    );

    drifts.push({
      invariantId,
      previousStatus,
      currentStatus,
      direction,
      newDefects,
      resolvedDefects,
    });
  }

  const netDirection = computeNetDirection(drifts);

  return {
    id: generateDriftId(),
    previousSnapshotId: previous.id,
    currentSnapshotId: current.id,
    generatedAt: new Date().toISOString(),
    drifts,
    netDirection,
  };
}

const STATUS_RANK: Record<CheckStatus, number> = {
  pass: 3,
  warn: 2,
  skip: 1,
  fail: 0,
};

function computeDirection(
  previous: CheckStatus,
  current: CheckStatus,
): DriftDirection {
  const prevRank = STATUS_RANK[previous];
  const currRank = STATUS_RANK[current];

  if (currRank > prevRank) return 'improved';
  if (currRank < prevRank) return 'degraded';
  return 'unchanged';
}

function computeNetDirection(drifts: InvariantDrift[]): DriftDirection {
  let improved = 0;
  let degraded = 0;

  for (const d of drifts) {
    if (d.direction === 'improved') improved++;
    if (d.direction === 'degraded') degraded++;
  }

  if (degraded > improved) return 'degraded';
  if (improved > degraded) return 'improved';
  return 'unchanged';
}
