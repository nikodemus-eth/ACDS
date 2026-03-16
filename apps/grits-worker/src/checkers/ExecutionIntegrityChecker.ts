/**
 * ExecutionIntegrityChecker — Verifies INV-001 and INV-002.
 *
 * INV-001: No execution path bypasses eligibility check.
 * INV-002: Fallback chain never escapes policy bounds.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { ExecutionRecordReadRepository, RoutingDecisionReadRepository } from '@acds/grits';
import type { ProviderRepository } from '@acds/provider-broker';
import type { PolicyRepository } from '@acds/policy-engine';
import type { ExecutionRecord, Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-EXEC-${++defectCounter}`;
}

export class ExecutionIntegrityChecker implements IntegrityChecker {
  readonly name = 'ExecutionIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-001', 'INV-002'];
  readonly supportedCadences: Cadence[] = ['fast', 'daily', 'release'];

  constructor(
    private readonly executionRepo: ExecutionRecordReadRepository,
    private readonly routingRepo: RoutingDecisionReadRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly policyRepo?: PolicyRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const hoursBack = cadence === 'fast' ? 1 : cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    const executions = await this.executionRepo.findByTimeRange(since, until);
    const enabledProviders = await this.providerRepo.findEnabled();
    const enabledProviderIds = new Set(enabledProviders.map((p: Provider) => p.id));

    const inv001Result = await this.checkINV001(executions);
    const inv002Result = await this.checkINV002(executions, enabledProviderIds);

    return {
      checkerName: this.name,
      cadence,
      invariants: [inv001Result, inv002Result],
    };
  }

  private async checkINV001(executions: ExecutionRecord[]): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];

    for (const exec of executions) {
      const decision = await this.routingRepo.findById(exec.routingDecisionId);

      if (!decision) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'high',
          title: 'Execution without routing decision',
          description: `Execution ${exec.id} has no matching routing decision (routingDecisionId: ${exec.routingDecisionId}).`,
          evidence: { executionId: exec.id, routingDecisionId: exec.routingDecisionId },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
        continue;
      }

      if (!decision.rationaleId) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'high',
          title: 'Routing decision missing rationale',
          description: `Routing decision ${decision.id} for execution ${exec.id} has no rationaleId, indicating eligibility check may have been bypassed.`,
          evidence: { executionId: exec.id, decisionId: decision.id },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // Independent eligibility recomputation (Principle 2)
      if (this.policyRepo) {
        const eligibilityDefects = await this.recomputeEligibility(exec);
        defects.push(...eligibilityDefects);
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
        ? `${defects.length} execution(s) missing routing decision or rationale`
        : `All ${executions.length} execution(s) have valid routing decisions`,
    };
  }

  private async checkINV002(
    executions: ExecutionRecord[],
    enabledProviderIds: Set<string>,
  ): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];

    const fallbackExecutions = executions.filter(
      (e) => e.status === 'fallback_succeeded' || e.status === 'fallback_failed',
    );

    for (const exec of fallbackExecutions) {
      const decision = await this.routingRepo.findById(exec.routingDecisionId);
      if (!decision) continue;

      for (const entry of decision.fallbackChain) {
        if (!enabledProviderIds.has(entry.providerId)) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-002',
            severity: 'high',
            title: 'Fallback chain references disabled provider',
            description: `Fallback entry for execution ${exec.id} references provider ${entry.providerId} which is not in the enabled provider set.`,
            evidence: {
              executionId: exec.id,
              decisionId: decision.id,
              fallbackProviderId: entry.providerId,
              fallbackPriority: entry.priority,
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return {
      invariantId: 'INV-002',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: fallbackExecutions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} fallback chain violation(s) found`
        : `All ${fallbackExecutions.length} fallback execution(s) within policy bounds`,
    };
  }

  /**
   * Independent eligibility recomputation (Design Principle 2).
   * Verifies the execution's selected provider, model profile, and tactic profile
   * against the effective policy — without trusting the routing engine's decision.
   */
  private async recomputeEligibility(
    exec: ExecutionRecord,
  ): Promise<DefectReport[]> {
    const defects: DefectReport[] = [];
    if (!this.policyRepo) return defects;

    // Load global policy for vendor checks
    const globalPolicy = await this.policyRepo.getGlobalPolicy();

    // 1. Provider vendor check — verify provider's vendor is not blocked
    if (globalPolicy && exec.selectedProviderId) {
      const provider = await this.providerRepo.findById(exec.selectedProviderId);
      if (provider) {
        const vendorStr = String(provider.vendor);
        const blockedStrs = globalPolicy.blockedVendors.map(String);
        if (blockedStrs.includes(vendorStr)) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-001',
            severity: 'critical',
            title: 'Execution used provider from blocked vendor',
            description: `Execution ${exec.id} selected provider ${provider.id} (vendor: ${provider.vendor}) which is blocked by global policy.`,
            evidence: {
              executionId: exec.id,
              providerId: provider.id,
              vendor: provider.vendor,
              blockedVendors: globalPolicy.blockedVendors,
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        }

        // Also check allowedVendors — if non-empty, vendor must be in it
        if (globalPolicy.allowedVendors.length > 0) {
          const allowedStrs = globalPolicy.allowedVendors.map(String);
          if (!allowedStrs.includes(vendorStr)) {
            defects.push({
              id: nextDefectId(),
              invariantId: 'INV-001',
              severity: 'high',
              title: 'Execution used provider from vendor not in allowed list',
              description: `Execution ${exec.id} selected provider ${provider.id} (vendor: ${provider.vendor}) which is not in the global policy allowed vendors list.`,
              evidence: {
                executionId: exec.id,
                providerId: provider.id,
                vendor: provider.vendor,
                allowedVendors: globalPolicy.allowedVendors,
              },
              resourceType: 'execution',
              resourceId: exec.id,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 2. Model profile blocklist check — verify model profile is not blocked at app/process level
    const appName = exec.executionFamily.application;
    const procName = exec.executionFamily.process;
    const stepName = exec.executionFamily.step;

    const appPolicy = await this.policyRepo.getApplicationPolicy(appName).catch(() => null);
    if (appPolicy && appPolicy.blockedModelProfileIds) {
      if (appPolicy.blockedModelProfileIds.includes(exec.selectedModelProfileId)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'high',
          title: 'Execution used blocked model profile',
          description: `Execution ${exec.id} selected model profile ${exec.selectedModelProfileId} which is blocked by application policy for "${appName}".`,
          evidence: {
            executionId: exec.id,
            modelProfileId: exec.selectedModelProfileId,
            application: appName,
            blockedModelProfileIds: appPolicy.blockedModelProfileIds,
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // 3. Process-level tactic allowlist check
    const procPolicy = await this.policyRepo.getProcessPolicy(appName, procName, stepName).catch(() => null);
    if (procPolicy && procPolicy.allowedTacticProfileIds && procPolicy.allowedTacticProfileIds.length > 0) {
      if (!procPolicy.allowedTacticProfileIds.includes(exec.selectedTacticProfileId)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'high',
          title: 'Execution used tactic profile not in allowed list',
          description: `Execution ${exec.id} selected tactic profile ${exec.selectedTacticProfileId} which is not in the process policy allowed list for "${appName}/${procName}/${stepName}".`,
          evidence: {
            executionId: exec.id,
            tacticProfileId: exec.selectedTacticProfileId,
            application: appName,
            process: procName,
            step: stepName,
            allowedTacticProfileIds: procPolicy.allowedTacticProfileIds,
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return defects;
  }
}
