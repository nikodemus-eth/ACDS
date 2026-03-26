/**
 * runReleaseIntegrityCheck — Runs release-triggered integrity checks.
 *
 * Executes all 7 checkers, saves the snapshot, and produces a
 * DriftReport by comparing against the previous release snapshot.
 */

import { runIntegrityChecks } from '../engine/IntegrityEngine.js';
import { analyzeDrift } from '../engine/DriftAnalyzer.js';
import { ExecutionIntegrityChecker } from '../checkers/ExecutionIntegrityChecker.js';
import { AdaptiveIntegrityChecker } from '../checkers/AdaptiveIntegrityChecker.js';
import { SecurityIntegrityChecker } from '../checkers/SecurityIntegrityChecker.js';
import { AuditIntegrityChecker } from '../checkers/AuditIntegrityChecker.js';
import { BoundaryIntegrityChecker } from '../checkers/BoundaryIntegrityChecker.js';
import { PolicyIntegrityChecker } from '../checkers/PolicyIntegrityChecker.js';
import { OperationalIntegrityChecker } from '../checkers/OperationalIntegrityChecker.js';
import { createPgRepositoryContext, type GritsRepositoryContext } from '../repositories/createPgRepositoryContext.js';

export async function runReleaseIntegrityCheck(
  context: GritsRepositoryContext = createPgRepositoryContext(),
) {
  const checkers = [
    new ExecutionIntegrityChecker(context.execRepo, context.routingRepo, context.providerRepo, context.policyRepo),
    new AdaptiveIntegrityChecker(context.optimizerRepo, context.approvalRepo, context.ledger, context.rollbackRepo, context.providerRepo),
    new SecurityIntegrityChecker(context.auditRepo, context.providerRepo, context.execRepo, context.routingRepo),
    new AuditIntegrityChecker(context.auditRepo, context.execRepo, context.approvalRepo),
    new BoundaryIntegrityChecker(context.execRepo, context.providerRepo, context.auditRepo),
    new PolicyIntegrityChecker(context.policyRepo, context.providerRepo),
    new OperationalIntegrityChecker(context.execRepo),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'release');
  await context.snapshotRepo.save(snapshot);

  // Drift analysis against previous release snapshot
  const previousRelease = await context.snapshotRepo.findLatestByCadence('release');
  if (previousRelease && previousRelease.id !== snapshot.id) {
    const drift = analyzeDrift(previousRelease, snapshot);
    console.log(
      `[grits-release] Drift: ${drift.netDirection.toUpperCase()} | ` +
      `${drift.drifts.filter((d) => d.direction === 'degraded').length} degraded, ` +
      `${drift.drifts.filter((d) => d.direction === 'improved').length} improved`,
    );
  } else {
    console.log('[grits-release] No previous release snapshot for drift comparison.');
  }

  const { critical, high, medium, low, info } = snapshot.defectCount;
  console.log(
    `[grits-release] Snapshot: ${snapshot.overallStatus.toUpperCase()} | ` +
    `${snapshot.results.length} invariant(s) checked | ` +
    `Defects: ${critical}C ${high}H ${medium}M ${low}L ${info}I`,
  );
  return snapshot;
}
