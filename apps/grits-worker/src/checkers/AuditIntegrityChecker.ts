/**
 * AuditIntegrityChecker — Verifies INV-007.
 *
 * INV-007: Every control action has a complete audit trail entry.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { ExecutionRecordReadRepository, AuditEventReadRepository } from '@acds/grits';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-AUDIT-${++defectCounter}`;
}

export class AuditIntegrityChecker implements IntegrityChecker {
  readonly name = 'AuditIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-007'];
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    private readonly auditRepo: AuditEventReadRepository,
    private readonly executionRepo: ExecutionRecordReadRepository,
    private readonly approvalRepo: AdaptationApprovalRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const inv007Result = await this.checkINV007(cadence);

    return {
      checkerName: this.name,
      cadence,
      invariants: [inv007Result],
    };
  }

  private async checkINV007(cadence: Cadence): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const hoursBack = cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    // Check execution records have corresponding audit events
    const executions = await this.executionRepo.findByTimeRange(since, until);
    let sampleSize = executions.length;

    for (const exec of executions) {
      const auditEvents = await this.auditRepo.findByResourceId(exec.id);
      if (auditEvents.length === 0) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-007',
          severity: 'high',
          title: 'Execution missing audit trail',
          description: `Execution ${exec.id} has no corresponding audit event.`,
          evidence: { executionId: exec.id, status: exec.status },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Check approval decisions have corresponding audit events
    const pendingApprovals = await this.approvalRepo.findPending();
    sampleSize += pendingApprovals.length;

    // Check approval decisions have corresponding audit events
    for (const approval of pendingApprovals) {
      const auditEvents = await this.auditRepo.findByResourceId(approval.id);
      const hasSubmittedEvent = auditEvents.some(
        (e) => e.action === 'approval_submitted' || e.action === 'submitted',
      );
      if (!hasSubmittedEvent) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-007',
          severity: 'high',
          title: 'Approval missing submission audit event',
          description: `Approval ${approval.id} for family ${approval.familyKey} has no submission audit event.`,
          evidence: {
            approvalId: approval.id,
            familyKey: approval.familyKey,
            status: approval.status,
          },
          resourceType: 'approval',
          resourceId: approval.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // Verify terminal approval states have corresponding audit events
      const terminalActions: Record<string, string[]> = {
        approved: ['approval_approved', 'approved'],
        rejected: ['approval_rejected', 'rejected'],
        expired: ['approval_expired', 'expired'],
      };
      const expectedActions = terminalActions[approval.status];
      if (expectedActions) {
        const hasTerminalEvent = auditEvents.some(
          (e) => expectedActions.includes(e.action),
        );
        if (!hasTerminalEvent) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-007',
            severity: 'high',
            title: `Approval missing ${approval.status} audit event`,
            description: `Approval ${approval.id} has status "${approval.status}" but no corresponding audit event (expected one of: ${expectedActions.join(', ')}).`,
            evidence: {
              approvalId: approval.id,
              familyKey: approval.familyKey,
              status: approval.status,
              expectedActions,
              actualActions: auditEvents.map((e) => e.action),
            },
            resourceType: 'approval',
            resourceId: approval.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Verify actor field presence on all audit events in the window
    const allEvents = await this.auditRepo.findByTimeRange(since, until);
    sampleSize += allEvents.length;

    for (const event of allEvents) {
      if (!event.actor || event.actor.trim() === '' || event.actor === 'unknown') {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-007',
          severity: 'medium',
          title: 'Audit event missing actor',
          description: `Audit event ${event.id} has no valid actor (found: "${event.actor || ''}"). All control actions must be attributable.`,
          evidence: {
            eventId: event.id,
            eventType: event.eventType,
            action: event.action,
            actor: event.actor,
          },
          resourceType: 'audit_event',
          resourceId: event.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Verify fallback executions have audit events
    for (const exec of executions) {
      if (exec.status === 'fallback_succeeded' || exec.status === 'fallback_failed') {
        const auditEvents = await this.auditRepo.findByResourceId(exec.id);
        const hasFallbackEvent = auditEvents.some(
          (e) => e.action.includes('fallback'),
        );
        if (!hasFallbackEvent) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-007',
            severity: 'medium',
            title: 'Fallback execution missing fallback audit event',
            description: `Execution ${exec.id} has status "${exec.status}" but no audit event referencing fallback behavior.`,
            evidence: {
              executionId: exec.id,
              status: exec.status,
              auditActions: auditEvents.map((e) => e.action),
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return {
      invariantId: 'INV-007',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize,
      defects,
      summary: defects.length > 0
        ? `${defects.length} audit trail deficiency/deficiencies across ${sampleSize} record(s)`
        : `All ${sampleSize} control action(s) have complete audit trails with valid actors`,
    };
  }
}
