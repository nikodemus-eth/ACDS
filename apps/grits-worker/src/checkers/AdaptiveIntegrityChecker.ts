/**
 * AdaptiveIntegrityChecker — Verifies INV-003 and INV-004.
 *
 * INV-003: Adaptive selection cannot touch ineligible candidates.
 * INV-004: Approval/rollback state machines reject invalid transitions.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { AdaptationRollbackReadRepository } from '@acds/grits';
import type {
  OptimizerStateRepository,
  AdaptationApprovalRepository,
  AdaptationLedgerWriter,
} from '@acds/adaptive-optimizer';
import { parseCandidateId } from '@acds/adaptive-optimizer';
import type { ProviderRepository } from '@acds/provider-broker';
import type { Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-ADAPT-${++defectCounter}`;
}

const VALID_APPROVAL_TRANSITIONS: Record<string, string[]> = {
  pending: ['approved', 'rejected', 'expired', 'superseded'],
  approved: [],
  rejected: [],
  expired: [],
  superseded: [],
};

export class AdaptiveIntegrityChecker implements IntegrityChecker {
  readonly name = 'AdaptiveIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-003', 'INV-004'];
  readonly supportedCadences: Cadence[] = ['fast', 'daily', 'release'];

  constructor(
    private readonly optimizerRepo: OptimizerStateRepository,
    private readonly approvalRepo: AdaptationApprovalRepository,
    private readonly ledger: AdaptationLedgerWriter,
    private readonly rollbackRepo: AdaptationRollbackReadRepository,
    private readonly providerRepo: ProviderRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const inv003Result = await this.checkINV003();
    const inv004Result = await this.checkINV004();

    return {
      checkerName: this.name,
      cadence,
      invariants: [inv003Result, inv004Result],
    };
  }

  private async checkINV003(): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const families = await this.optimizerRepo.listFamilies();

    const enabledProviders = await this.providerRepo.findEnabled();
    const enabledProviderIds = new Set(enabledProviders.map((p: Provider) => p.id));

    for (const familyKey of families) {
      const familyState = await this.optimizerRepo.getFamilyState(familyKey);
      if (!familyState?.currentCandidateId) continue;

      try {
        const parsed = parseCandidateId(familyState.currentCandidateId);
        if (!enabledProviderIds.has(parsed.providerId)) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-003',
            severity: 'critical',
            title: 'Active candidate references disabled provider',
            description: `Family ${familyKey} has currentCandidateId "${familyState.currentCandidateId}" referencing provider "${parsed.providerId}" which is not enabled.`,
            evidence: {
              familyKey,
              candidateId: familyState.currentCandidateId,
              providerId: parsed.providerId,
            },
            resourceType: 'family',
            resourceId: familyKey,
            detectedAt: new Date().toISOString(),
          });
        }
      } catch {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-003',
          severity: 'high',
          title: 'Unparseable candidate ID',
          description: `Family ${familyKey} has currentCandidateId "${familyState.currentCandidateId}" that cannot be parsed.`,
          evidence: { familyKey, candidateId: familyState.currentCandidateId },
          resourceType: 'family',
          resourceId: familyKey,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'INV-003',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: families.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} family(ies) with ineligible active candidates`
        : `All ${families.length} family(ies) have eligible active candidates`,
    };
  }

  private async checkINV004(): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const families = await this.optimizerRepo.listFamilies();
    let totalApprovals = 0;

    const enabledProviders = await this.providerRepo.findEnabled();
    const enabledProviderIds = new Set(enabledProviders.map((p: Provider) => p.id));

    for (const familyKey of families) {
      const approvals = await this.approvalRepo.findByFamily(familyKey);
      totalApprovals += approvals.length;

      for (const approval of approvals) {
        if (approval.status !== 'pending') {
          // Terminal state — verify it was reachable from pending
          const validTargets = VALID_APPROVAL_TRANSITIONS['pending'] ?? [];
          if (!validTargets.includes(approval.status)) {
            defects.push({
              id: nextDefectId(),
              invariantId: 'INV-004',
              severity: 'high',
              title: 'Invalid approval state transition',
              description: `Approval ${approval.id} for family ${familyKey} is in state "${approval.status}" which is not a valid transition from pending.`,
              evidence: { approvalId: approval.id, familyKey, status: approval.status },
              resourceType: 'approval',
              resourceId: approval.id,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }

      // Check rollback records reference valid adaptation events
      const rollbacks = await this.rollbackRepo.findByFamily(familyKey);
      for (const rollback of rollbacks) {
        const event = await this.ledger.getEvent(rollback.targetAdaptationEventId);
        if (!event) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-004',
            severity: 'high',
            title: 'Rollback references missing adaptation event',
            description: `Rollback ${rollback.id} references adaptation event ${rollback.targetAdaptationEventId} which does not exist.`,
            evidence: {
              rollbackId: rollback.id,
              targetEventId: rollback.targetAdaptationEventId,
              familyKey,
            },
            resourceType: 'rollback',
            resourceId: rollback.id,
            detectedAt: new Date().toISOString(),
          });
        }

        // Gap 6: Validate restored state is safe — check that every candidate
        // in the restored snapshot references an enabled provider
        if (rollback.restoredSnapshot?.candidateRankings) {
          for (const ranking of rollback.restoredSnapshot.candidateRankings) {
            try {
              const parsed = parseCandidateId(ranking.candidateId);
              if (!enabledProviderIds.has(parsed.providerId)) {
                defects.push({
                  id: nextDefectId(),
                  invariantId: 'INV-004',
                  severity: 'high',
                  title: 'Rollback restores ranking with ineligible candidate',
                  description: `Rollback ${rollback.id} restores candidate "${ranking.candidateId}" referencing provider "${parsed.providerId}" which is no longer enabled.`,
                  evidence: {
                    rollbackId: rollback.id,
                    candidateId: ranking.candidateId,
                    providerId: parsed.providerId,
                    familyKey,
                  },
                  resourceType: 'rollback',
                  resourceId: rollback.id,
                  detectedAt: new Date().toISOString(),
                });
              }
            } catch {
              // Unparseable candidate in restored snapshot
            }
          }
        }
      }
    }

    return {
      invariantId: 'INV-004',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: totalApprovals,
      defects,
      summary: defects.length > 0
        ? `${defects.length} state machine violation(s) found`
        : `All approval/rollback state transitions are valid`,
    };
  }
}
