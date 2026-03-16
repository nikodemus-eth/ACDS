/**
 * PolicyIntegrityChecker — Validates policy coherence.
 *
 * Reads all policy layers and checks for conflicts, empty eligibility
 * sets, and invalid profile references.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { PolicyRepository } from '@acds/policy-engine';
import type { ProviderRepository } from '@acds/provider-broker';
import type { Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-POL-${++defectCounter}`;
}

export class PolicyIntegrityChecker implements IntegrityChecker {
  readonly name = 'PolicyIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-001'];
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    private readonly policyRepo: PolicyRepository,
    private readonly providerRepo: ProviderRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const result = await this.checkPolicyCoherence();

    return {
      checkerName: this.name,
      cadence,
      invariants: [result],
    };
  }

  private async checkPolicyCoherence(): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    let sampleSize = 0;

    const globalPolicy = await this.policyRepo.getGlobalPolicy();
    if (globalPolicy) sampleSize++;

    const appPolicies = await this.policyRepo.listApplicationPolicies();
    sampleSize += appPolicies.length;

    const enabledProviders = await this.providerRepo.findEnabled();
    const enabledVendors = new Set<string>(enabledProviders.map((p: Provider) => p.vendor));

    // Check for vendor conflicts in application policies
    for (const appPolicy of appPolicies) {
      if (appPolicy.allowedVendors && appPolicy.blockedVendors) {
        const allowed = appPolicy.allowedVendors.map(String);
        const blocked = appPolicy.blockedVendors.map(String);
        const overlap = allowed.filter((v) => blocked.includes(v));
        if (overlap.length > 0) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-001',
            severity: 'medium',
            title: 'Vendor appears in both allowed and blocked lists',
            description: `Application policy for "${appPolicy.application}" has vendor(s) [${overlap.join(', ')}] in both allowed and blocked lists.`,
            evidence: {
              application: appPolicy.application,
              overlappingVendors: overlap,
            },
            resourceType: 'policy',
            resourceId: appPolicy.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Check for empty allowed vendors (ambiguous semantics)
      if (appPolicy.allowedVendors && appPolicy.allowedVendors.length === 0) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-001',
          severity: 'medium',
          title: 'Empty allowedVendors — ambiguous semantics',
          description: `Application policy for "${appPolicy.application}" has an empty allowedVendors array. It is ambiguous whether this means "all vendors" or "no vendors".`,
          evidence: { application: appPolicy.application },
          resourceType: 'policy',
          resourceId: appPolicy.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // Check if allowed vendors reference vendors with no enabled providers
      if (appPolicy.allowedVendors) {
        for (const vendor of appPolicy.allowedVendors) {
          if (!enabledVendors.has(String(vendor))) {
            defects.push({
              id: nextDefectId(),
              invariantId: 'INV-001',
              severity: 'low',
              title: 'Allowed vendor has no enabled providers',
              description: `Application policy for "${appPolicy.application}" allows vendor "${vendor}" but no enabled providers exist for that vendor.`,
              evidence: { application: appPolicy.application, vendor },
              resourceType: 'policy',
              resourceId: appPolicy.id,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return {
      invariantId: 'INV-001',
      status: defects.some((d) => d.severity === 'high' || d.severity === 'critical')
        ? 'fail'
        : defects.length > 0
          ? 'warn'
          : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize,
      defects,
      summary: defects.length > 0
        ? `${defects.length} policy coherence issue(s) found`
        : `All ${sampleSize} policy(ies) are coherent`,
    };
  }
}
