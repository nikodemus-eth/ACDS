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
import { createPgRepositoryContext, type GritsRepositoryContext } from '../repositories/createPgRepositoryContext.js';

export async function runDailyIntegrityCheck(
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
    new AppleIntelligenceChecker(context.execRepo, context.providerRepo),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'daily');
  await context.snapshotRepo.save(snapshot);

  const { critical, high, medium, low, info } = snapshot.defectCount;
  console.log(
    `[grits-daily] Snapshot: ${snapshot.overallStatus.toUpperCase()} | ` +
    `${snapshot.results.length} invariant(s) checked | ` +
    `Defects: ${critical}C ${high}H ${medium}M ${low}L ${info}I`,
  );
  return snapshot;
}
