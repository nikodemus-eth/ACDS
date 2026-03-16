/**
 * runDailyIntegrityCheck — Runs daily full integrity sweep.
 *
 * Executes all 7 checkers and saves the IntegritySnapshot.
 */

import { runIntegrityChecks } from '../engine/IntegrityEngine.js';
import { ExecutionIntegrityChecker } from '../checkers/ExecutionIntegrityChecker.js';
import { AdaptiveIntegrityChecker } from '../checkers/AdaptiveIntegrityChecker.js';
import { SecurityIntegrityChecker } from '../checkers/SecurityIntegrityChecker.js';
import { AuditIntegrityChecker } from '../checkers/AuditIntegrityChecker.js';
import { BoundaryIntegrityChecker } from '../checkers/BoundaryIntegrityChecker.js';
import { PolicyIntegrityChecker } from '../checkers/PolicyIntegrityChecker.js';
import { OperationalIntegrityChecker } from '../checkers/OperationalIntegrityChecker.js';
import { AppleIntelligenceChecker } from '../checkers/AppleIntelligenceChecker.js';
import { getExecutionRecordReadRepository } from '../repositories/InMemoryExecutionRecordReadRepository.js';
import { getRoutingDecisionReadRepository } from '../repositories/InMemoryRoutingDecisionReadRepository.js';
import { getAuditEventReadRepository } from '../repositories/InMemoryAuditEventReadRepository.js';
import { getAdaptationRollbackReadRepository } from '../repositories/InMemoryAdaptationRollbackReadRepository.js';
import { getIntegritySnapshotRepository } from '../repositories/InMemoryIntegritySnapshotRepository.js';
import { getSharedOptimizerStateRepository, getSharedApprovalRepository, getSharedLedger, getSharedProviderRepository, getSharedPolicyRepository } from '../repositories/sharedRepositories.js';

export async function runDailyIntegrityCheck(): Promise<void> {
  const execRepo = getExecutionRecordReadRepository();
  const routingRepo = getRoutingDecisionReadRepository();
  const auditRepo = getAuditEventReadRepository();
  const rollbackRepo = getAdaptationRollbackReadRepository();
  const providerRepo = getSharedProviderRepository();
  const optimizerRepo = getSharedOptimizerStateRepository();
  const approvalRepo = getSharedApprovalRepository();
  const ledger = getSharedLedger();
  const policyRepo = getSharedPolicyRepository();

  const checkers = [
    new ExecutionIntegrityChecker(execRepo, routingRepo, providerRepo, policyRepo),
    new AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo),
    new SecurityIntegrityChecker(auditRepo, providerRepo, execRepo, routingRepo),
    new AuditIntegrityChecker(auditRepo, execRepo, approvalRepo),
    new BoundaryIntegrityChecker(execRepo, providerRepo, auditRepo),
    new PolicyIntegrityChecker(policyRepo, providerRepo),
    new OperationalIntegrityChecker(execRepo),
    new AppleIntelligenceChecker(execRepo, providerRepo),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'daily');
  await getIntegritySnapshotRepository().save(snapshot);

  const { critical, high, medium, low, info } = snapshot.defectCount;
  console.log(
    `[grits-daily] Snapshot: ${snapshot.overallStatus.toUpperCase()} | ` +
    `${snapshot.results.length} invariant(s) checked | ` +
    `Defects: ${critical}C ${high}H ${medium}M ${low}L ${info}I`,
  );
}
