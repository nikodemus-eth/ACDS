/**
 * runFastIntegrityCheck — Runs hourly fast-cadence integrity checks.
 *
 * Executes ExecutionIntegrityChecker and AdaptiveIntegrityChecker,
 * then saves the resulting IntegritySnapshot.
 */

import { runIntegrityChecks } from '../engine/IntegrityEngine.js';
import { ExecutionIntegrityChecker } from '../checkers/ExecutionIntegrityChecker.js';
import { AdaptiveIntegrityChecker } from '../checkers/AdaptiveIntegrityChecker.js';
import { AppleIntelligenceChecker } from '../checkers/AppleIntelligenceChecker.js';
import { getExecutionRecordReadRepository } from '../repositories/InMemoryExecutionRecordReadRepository.js';
import { getRoutingDecisionReadRepository } from '../repositories/InMemoryRoutingDecisionReadRepository.js';
import { getAdaptationRollbackReadRepository } from '../repositories/InMemoryAdaptationRollbackReadRepository.js';
import { getIntegritySnapshotRepository } from '../repositories/InMemoryIntegritySnapshotRepository.js';
import { getSharedOptimizerStateRepository, getSharedApprovalRepository, getSharedLedger, getSharedProviderRepository, getSharedPolicyRepository } from '../repositories/sharedRepositories.js';

export async function runFastIntegrityCheck(): Promise<void> {
  const checkers = [
    new ExecutionIntegrityChecker(
      getExecutionRecordReadRepository(),
      getRoutingDecisionReadRepository(),
      getSharedProviderRepository(),
      getSharedPolicyRepository(),
    ),
    new AdaptiveIntegrityChecker(
      getSharedOptimizerStateRepository(),
      getSharedApprovalRepository(),
      getSharedLedger(),
      getAdaptationRollbackReadRepository(),
      getSharedProviderRepository(),
    ),
    new AppleIntelligenceChecker(
      getExecutionRecordReadRepository(),
      getSharedProviderRepository(),
    ),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'fast');
  await getIntegritySnapshotRepository().save(snapshot);

  logSnapshotSummary('fast', snapshot);
}

function logSnapshotSummary(cadence: string, snapshot: { overallStatus: string; defectCount: { critical: number; high: number; medium: number; low: number; info: number }; results: { length: number } }): void {
  const { critical, high, medium, low, info } = snapshot.defectCount;
  console.log(
    `[grits-${cadence}] Snapshot: ${snapshot.overallStatus.toUpperCase()} | ` +
    `${snapshot.results.length} invariant(s) checked | ` +
    `Defects: ${critical}C ${high}H ${medium}M ${low}L ${info}I`,
  );
}
