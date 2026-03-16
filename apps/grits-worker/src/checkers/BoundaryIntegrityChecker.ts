/**
 * BoundaryIntegrityChecker — Deep verification of INV-001.
 *
 * Performs a full sweep of all executions verifying that no execution
 * references a provider outside the enabled set. Also checks audit event
 * coherence to detect potential layer-collapse scenarios where subsystems
 * produce audit events outside their expected resource scope.
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
import type { ProviderRepository } from '@acds/provider-broker';
import type { Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-BOUND-${++defectCounter}`;
}

/**
 * Maps audit event action prefixes to valid resource types.
 * If an audit event action starts with a known prefix but references
 * a resource type outside the expected set, it may indicate layer collapse.
 */
const ACTION_RESOURCE_COHERENCE: Record<string, Set<string>> = {
  routing: new Set(['routing_decision', 'execution']),
  execution: new Set(['execution']),
  provider: new Set(['provider', 'provider_config']),
  approval: new Set(['approval', 'adaptation']),
  rollback: new Set(['adaptation', 'approval', 'optimizer_state']),
  policy: new Set(['policy', 'policy_overlay']),
  optimizer: new Set(['optimizer_state', 'adaptation']),
};

export class BoundaryIntegrityChecker implements IntegrityChecker {
  readonly name = 'BoundaryIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-001'];
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    private readonly executionRepo: ExecutionRecordReadRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly auditRepo?: AuditEventReadRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const inv001Result = await this.checkBoundaries(cadence);

    // Merge coherence defects into the same invariant result if audit repo available
    if (this.auditRepo) {
      const coherenceDefects = await this.checkAuditCoherence(cadence);
      inv001Result.defects.push(...coherenceDefects);
      inv001Result.sampleSize += coherenceDefects.length > 0 ? coherenceDefects.length : 0;
      if (coherenceDefects.length > 0 && inv001Result.status === 'pass') {
        inv001Result.status = 'fail';
      }
      if (coherenceDefects.length > 0) {
        inv001Result.summary += ` | ${coherenceDefects.length} audit coherence violation(s)`;
      }
    }

    return {
      checkerName: this.name,
      cadence,
      invariants: [inv001Result],
    };
  }

  private async checkBoundaries(cadence: Cadence): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const hoursBack = cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    const executions = await this.executionRepo.findByTimeRange(since, until);
    const enabledProviders = await this.providerRepo.findEnabled();
    const allProviders = await this.providerRepo.findAll();

    const enabledIds = new Set(enabledProviders.map((p: Provider) => p.id));
    const allProviderIds = new Set(allProviders.map((p: Provider) => p.id));

    for (const exec of executions) {
      if (!enabledIds.has(exec.selectedProviderId)) {
        const exists = allProviderIds.has(exec.selectedProviderId);
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: exists ? 'high' : 'critical',
          title: exists
            ? 'Execution used disabled provider'
            : 'Execution used unknown provider',
          description: `Execution ${exec.id} selected provider "${exec.selectedProviderId}" which is ${exists ? 'disabled' : 'not in the provider registry'}.`,
          evidence: {
            executionId: exec.id,
            selectedProviderId: exec.selectedProviderId,
            providerExists: exists,
            providerEnabled: false,
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'INV-001',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: executions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} execution(s) used non-enabled providers`
        : `All ${executions.length} execution(s) used enabled providers`,
    };
  }

  /**
   * Checks audit event coherence — validates that audit event actions
   * reference resource types consistent with their domain. This serves
   * as a proxy for layer-collapse detection: if a routing-domain action
   * suddenly references a provider-domain resource, it suggests a subsystem
   * is operating outside its boundary.
   */
  private async checkAuditCoherence(cadence: Cadence): Promise<DefectReport[]> {
    if (!this.auditRepo) return [];

    const defects: DefectReport[] = [];
    const hoursBack = cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    const events = await this.auditRepo.findByTimeRange(since, until);

    for (const event of events) {
      const actionPrefix = event.action.split('_')[0];
      const expectedResources = ACTION_RESOURCE_COHERENCE[actionPrefix];

      if (expectedResources && !expectedResources.has(event.resourceType)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'medium',
          title: 'Audit event boundary coherence violation',
          description: `Audit event ${event.id} has action "${event.action}" (${actionPrefix} domain) but references resource type "${event.resourceType}" which is outside the expected set [${Array.from(expectedResources).join(', ')}].`,
          evidence: {
            eventId: event.id,
            action: event.action,
            actionDomain: actionPrefix,
            actualResourceType: event.resourceType,
            expectedResourceTypes: Array.from(expectedResources),
          },
          resourceType: 'audit_event',
          resourceId: event.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return defects;
  }
}
