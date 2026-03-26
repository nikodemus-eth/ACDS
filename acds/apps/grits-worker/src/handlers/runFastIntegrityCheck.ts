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
import { createPgRepositoryContext, type GritsRepositoryContext } from '../repositories/createPgRepositoryContext.js';

export async function runFastIntegrityCheck(
  context: GritsRepositoryContext = createPgRepositoryContext(),
) {
  const checkers = [
    new ExecutionIntegrityChecker(
      context.execRepo,
      context.routingRepo,
      context.providerRepo,
      context.policyRepo,
    ),
    new AdaptiveIntegrityChecker(
      context.optimizerRepo,
      context.approvalRepo,
      context.ledger,
      context.rollbackRepo,
      context.providerRepo,
    ),
    new AppleIntelligenceChecker(
      context.execRepo,
      context.providerRepo,
    ),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'fast');
  await context.snapshotRepo.save(snapshot);

  logSnapshotSummary('fast', snapshot);
  return snapshot;
}

function logSnapshotSummary(cadence: string, snapshot: { overallStatus: string; defectCount: { critical: number; high: number; medium: number; low: number; info: number }; results: { length: number } }): void {
  const { critical, high, medium, low, info } = snapshot.defectCount;
  console.log(
    `[grits-${cadence}] Snapshot: ${snapshot.overallStatus.toUpperCase()} | ` +
    `${snapshot.results.length} invariant(s) checked | ` +
    `Defects: ${critical}C ${high}H ${medium}M ${low}L ${info}I`,
  );
}
