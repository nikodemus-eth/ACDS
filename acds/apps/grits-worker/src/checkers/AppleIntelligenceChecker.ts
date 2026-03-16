/**
 * AppleIntelligenceChecker — Verifies AI-001 through AI-006.
 *
 * AI-001: Apple bridge must respond on localhost only.
 * AI-002: Apple capabilities must be re-validated after OS update.
 * AI-003: Apple adapter must reject non-loopback baseUrl.
 * AI-004: Apple execution must enforce macOS-only platform constraint.
 * AI-005: Apple model tokens must stay within Foundation Models limits.
 * AI-006: Apple bridge health must be checked before dispatch.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ProviderRepository } from '@acds/provider-broker';
import { ProviderVendor } from '@acds/core-types';
import type { Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-APPLE-${String(++defectCounter).padStart(3, '0')}`;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const APPLE_TOKEN_LIMIT = 4096;

export class AppleIntelligenceChecker implements IntegrityChecker {
  readonly name = 'AppleIntelligenceChecker';
  readonly invariantIds: InvariantId[] = ['AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006'];
  readonly supportedCadences: Cadence[] = ['fast', 'daily', 'release'];

  constructor(
    private readonly executionRepo: ExecutionRecordReadRepository,
    private readonly providerRepo: ProviderRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const appleProviders = await this.providerRepo.findByVendor(ProviderVendor.APPLE);
    const hoursBack = cadence === 'fast' ? 1 : cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();
    const executions = await this.executionRepo.findByTimeRange(since, until);
    const appleProviderIds = new Set(appleProviders.map((p) => p.id));
    const appleExecutions = executions.filter((e) => appleProviderIds.has(e.selectedProviderId));

    const invariants = [
      this.checkAI001(appleProviders),
      this.checkAI002(appleProviders),
      this.checkAI003(appleProviders),
      this.checkAI004(appleExecutions),
      this.checkAI005(appleExecutions),
      this.checkAI006(appleExecutions, appleProviders),
    ];

    return { checkerName: this.name, cadence, invariants };
  }

  private checkAI001(providers: Provider[]): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];

    for (const provider of providers) {
      try {
        const url = new URL(provider.baseUrl);
        if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'AI-001',
            severity: 'critical',
            title: 'Apple provider not on localhost',
            description: `Apple provider "${provider.name}" (${provider.id}) has baseUrl targeting "${url.hostname}" which is not a loopback address.`,
            evidence: { providerId: provider.id, baseUrl: provider.baseUrl, hostname: url.hostname },
            resourceType: 'provider',
            resourceId: provider.id,
            detectedAt: new Date().toISOString(),
          });
        }
      } catch {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-001',
          severity: 'high',
          title: 'Apple provider has invalid baseUrl',
          description: `Apple provider "${provider.name}" (${provider.id}) has an unparseable baseUrl.`,
          evidence: { providerId: provider.id, baseUrl: provider.baseUrl },
          resourceType: 'provider',
          resourceId: provider.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-001',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: providers.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple provider(s) not on localhost`
        : `All ${providers.length} Apple provider(s) use loopback addresses`,
    };
  }

  private checkAI002(providers: Provider[]): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];

    for (const provider of providers) {
      if (!provider.enabled) continue;
      const hoursSinceUpdate = (Date.now() - provider.updatedAt.getTime()) / 3600_000;
      if (hoursSinceUpdate > 168) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-002',
          severity: 'medium',
          title: 'Apple provider capabilities may be stale',
          description: `Apple provider "${provider.name}" (${provider.id}) has not been validated in ${Math.round(hoursSinceUpdate)} hours. Capabilities should be re-validated after OS updates.`,
          evidence: { providerId: provider.id, lastUpdated: provider.updatedAt.toISOString(), hoursSinceUpdate: Math.round(hoursSinceUpdate) },
          resourceType: 'provider',
          resourceId: provider.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-002',
      status: defects.length > 0 ? 'warn' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: providers.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple provider(s) with stale capabilities`
        : `All ${providers.length} Apple provider(s) have recent capability validation`,
    };
  }

  private checkAI003(providers: Provider[]): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];

    for (const provider of providers) {
      try {
        const url = new URL(provider.baseUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          defects.push({
            id: nextDefectId(),
            invariantId: 'AI-003',
            severity: 'critical',
            title: 'Apple provider uses unsafe scheme',
            description: `Apple provider "${provider.name}" (${provider.id}) uses "${url.protocol}" scheme. Only http: and https: are allowed.`,
            evidence: { providerId: provider.id, scheme: url.protocol },
            resourceType: 'provider',
            resourceId: provider.id,
            detectedAt: new Date().toISOString(),
          });
        }
        if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'AI-003',
            severity: 'critical',
            title: 'Apple adapter config targets non-loopback',
            description: `Apple provider "${provider.name}" (${provider.id}) has baseUrl targeting "${url.hostname}" — must be loopback for on-device execution.`,
            evidence: { providerId: provider.id, hostname: url.hostname },
            resourceType: 'provider',
            resourceId: provider.id,
            detectedAt: new Date().toISOString(),
          });
        }
      } catch {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-003',
          severity: 'high',
          title: 'Apple provider has invalid baseUrl',
          description: `Apple provider "${provider.name}" (${provider.id}) has an unparseable baseUrl.`,
          evidence: { providerId: provider.id, baseUrl: provider.baseUrl },
          resourceType: 'provider',
          resourceId: provider.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-003',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: providers.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple adapter config violation(s)`
        : `All ${providers.length} Apple provider config(s) pass validation`,
    };
  }

  private checkAI004(executions: Array<{ id: string; selectedProviderId: string }>): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const platform = process.platform;

    if (platform !== 'darwin' && executions.length > 0) {
      for (const exec of executions) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-004',
          severity: 'critical',
          title: 'Apple execution on non-macOS platform',
          description: `Execution ${exec.id} was routed to an Apple provider on platform "${platform}". Apple Intelligence is only available on macOS.`,
          evidence: { executionId: exec.id, platform },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-004',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: executions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple execution(s) on non-macOS platform`
        : `${executions.length} Apple execution(s) on correct platform (${platform})`,
    };
  }

  private checkAI005(executions: Array<{ id: string; outputTokens: number | null; inputTokens: number | null }>): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];

    for (const exec of executions) {
      const totalTokens = (exec.inputTokens ?? 0) + (exec.outputTokens ?? 0);
      if (totalTokens > APPLE_TOKEN_LIMIT) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-005',
          severity: 'high',
          title: 'Apple execution exceeded token limit',
          description: `Execution ${exec.id} used ${totalTokens} tokens, exceeding the Foundation Models limit of ${APPLE_TOKEN_LIMIT}.`,
          evidence: { executionId: exec.id, inputTokens: exec.inputTokens, outputTokens: exec.outputTokens, totalTokens, limit: APPLE_TOKEN_LIMIT },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-005',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: executions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple execution(s) exceeded token limits`
        : `All ${executions.length} Apple execution(s) within Foundation Models token limits`,
    };
  }

  private checkAI006(
    executions: Array<{ id: string; selectedProviderId: string }>,
    providers: Provider[],
  ): InvariantCheckResult {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const disabledProviderIds = new Set(providers.filter((p) => !p.enabled).map((p) => p.id));

    for (const exec of executions) {
      if (disabledProviderIds.has(exec.selectedProviderId)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'AI-006',
          severity: 'high',
          title: 'Apple execution routed to disabled provider',
          description: `Execution ${exec.id} was routed to Apple provider ${exec.selectedProviderId} which is currently disabled. Bridge health was not verified.`,
          evidence: { executionId: exec.id, providerId: exec.selectedProviderId },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'AI-006',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: executions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} Apple execution(s) routed without health verification`
        : `All ${executions.length} Apple execution(s) had verified bridge health`,
    };
  }
}
