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
import { getExecutionRecordReadRepository } from '../repositories/InMemoryExecutionRecordReadRepository.js';
import { getRoutingDecisionReadRepository } from '../repositories/InMemoryRoutingDecisionReadRepository.js';
import { getAuditEventReadRepository } from '../repositories/InMemoryAuditEventReadRepository.js';
import { getAdaptationRollbackReadRepository } from '../repositories/InMemoryAdaptationRollbackReadRepository.js';
import { getIntegritySnapshotRepository } from '../repositories/InMemoryIntegritySnapshotRepository.js';
import { getSharedOptimizerStateRepository, getSharedApprovalRepository, getSharedLedger, getSharedProviderRepository, getSharedPolicyRepository } from '../repositories/sharedRepositories.js';

export async function runReleaseIntegrityCheck(): Promise<void> {
  const execRepo = getExecutionRecordReadRepository();
  const routingRepo = getRoutingDecisionReadRepository();
  const auditRepo = getAuditEventReadRepository();
  const rollbackRepo = getAdaptationRollbackReadRepository();
  const providerRepo = getSharedProviderRepository();
  const optimizerRepo = getSharedOptimizerStateRepository();
  const approvalRepo = getSharedApprovalRepository();
  const ledger = getSharedLedger();
  const policyRepo = getSharedPolicyRepository();
  const snapshotRepo = getIntegritySnapshotRepository();

  const checkers = [
    new ExecutionIntegrityChecker(execRepo, routingRepo, providerRepo, policyRepo),
    new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo),
    new SecurityIntegrityChecker(auditRepo, providerRepo, execRepo, routingRepo),
    new AuditIntegrityChecker(auditRepo, execRepo, approvalRepo),
    new BoundaryIntegrityChecker(execRepo, providerRepo, auditRepo),
    new PolicyIntegrityChecker(policyRepo, providerRepo),
    new OperationalIntegrityChecker(execRepo),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'release');
  await snapshotRepo.save(snapshot);

  // Drift analysis against previous release snapshot
  const previousRelease = await snapshotRepo.findLatestByCadence('release');
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
}
