/**
 * SecurityIntegrityChecker — Verifies INV-005 and INV-006.
 *
 * INV-005: No plaintext secret exposure in logs/responses/audit.
 * INV-006: Provider endpoints restricted to safe schemes and hosts.
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { AuditEventReadRepository, ExecutionRecordReadRepository, RoutingDecisionReadRepository } from '@acds/grits';
import type { ProviderRepository } from '@acds/provider-broker';
import type { Provider } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-SEC-${++defectCounter}`;
}

/**
 * Patterns that indicate potential secret exposure in audit event details.
 */
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,          // OpenAI-style API keys
  /Bearer\s+[a-zA-Z0-9._\-]+/i,   // Bearer tokens
  /api[_-]?key["\s:=]+[a-zA-Z0-9]{16,}/i, // Generic API keys
  /password["\s:=]+[^\s"]{4,}/i,   // Password values
  /secret["\s:=]+[^\s"]{4,}/i,     // Secret values
  /token["\s:=]+[a-zA-Z0-9._\-]{16,}/i, // Token values
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, // PEM private keys
];

const SAFE_SCHEMES = new Set(['https:']);

const UNSAFE_HOSTS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^169\.254\.\d+\.\d+$/, // AWS metadata
  /^0x[0-9a-f]+$/i,       // Hex-encoded IPs
];

export class SecurityIntegrityChecker implements IntegrityChecker {
  readonly name = 'SecurityIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-005', 'INV-006'];
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    private readonly auditRepo: AuditEventReadRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly executionRepo?: ExecutionRecordReadRepository,
    private readonly routingRepo?: RoutingDecisionReadRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const inv005Result = await this.checkINV005(cadence);
    const inv006Result = await this.checkINV006();

    return {
      checkerName: this.name,
      cadence,
      invariants: [inv005Result, inv006Result],
    };
  }

  private async checkINV005(cadence: Cadence): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const hoursBack = cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    const events = await this.auditRepo.findByTimeRange(since, until);

    for (const event of events) {
      const detailsStr = JSON.stringify(event.details);

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(detailsStr)) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-005',
            severity: 'critical',
            title: 'Potential secret exposure in audit event',
            description: `Audit event ${event.id} contains a value matching secret pattern "${pattern.source}" in its details field.`,
            evidence: {
              eventId: event.id,
              eventType: event.eventType,
              patternMatched: pattern.source,
            },
            resourceType: 'audit_event',
            resourceId: event.id,
            detectedAt: new Date().toISOString(),
          });
          break; // One defect per event is sufficient
        }
      }
    }

    // Scan execution errorMessage and normalizedOutput fields
    let execCount = 0;
    if (this.executionRepo) {
      const executions = await this.executionRepo.findByTimeRange(since, until);
      execCount = executions.length;

      for (const exec of executions) {
        const fieldsToScan: { fieldName: string; value: string | null }[] = [
          { fieldName: 'errorMessage', value: exec.errorMessage },
          { fieldName: 'normalizedOutput', value: exec.normalizedOutput },
        ];

        for (const { fieldName, value } of fieldsToScan) {
          if (!value) continue;
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(value)) {
              defects.push({
                id: nextDefectId(),
                invariantId: 'INV-005',
                severity: 'critical',
                title: `Potential secret exposure in execution ${fieldName}`,
                description: `Execution ${exec.id} has a value matching secret pattern "${pattern.source}" in its ${fieldName} field.`,
                evidence: {
                  executionId: exec.id,
                  field: fieldName,
                  patternMatched: pattern.source,
                },
                resourceType: 'execution',
                resourceId: exec.id,
                detectedAt: new Date().toISOString(),
              });
              break; // One defect per field
            }
          }
        }
      }
    }

    // Scan routing decision rationaleSummary fields
    let routingCount = 0;
    if (this.routingRepo && this.executionRepo) {
      const executions = execCount > 0
        ? await this.executionRepo.findByTimeRange(since, until)
        : [];
      routingCount = executions.length;

      for (const exec of executions) {
        const decision = await this.routingRepo.findByExecutionId(exec.id);
        if (!decision?.rationaleSummary) continue;

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(decision.rationaleSummary)) {
            defects.push({
              id: nextDefectId(),
              invariantId: 'INV-005',
              severity: 'critical',
              title: 'Potential secret exposure in routing rationale',
              description: `Routing decision ${decision.id} has a value matching secret pattern "${pattern.source}" in its rationaleSummary.`,
              evidence: {
                decisionId: decision.id,
                field: 'rationaleSummary',
                patternMatched: pattern.source,
              },
              resourceType: 'routing_decision',
              resourceId: decision.id,
              detectedAt: new Date().toISOString(),
            });
            break;
          }
        }
      }
    }

    const totalScanned = events.length + execCount + routingCount;

    return {
      invariantId: 'INV-005',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: totalScanned,
      defects,
      summary: defects.length > 0
        ? `${defects.length} record(s) with potential secret exposure across ${totalScanned} scanned`
        : `${totalScanned} record(s) scanned (${events.length} audit, ${execCount} execution, ${routingCount} routing), no secrets found`,
    };
  }

  private async checkINV006(): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const providers = await this.providerRepo.findAll();

    for (const provider of providers) {
      try {
        const url = new URL(provider.baseUrl);

        if (!SAFE_SCHEMES.has(url.protocol)) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-006',
            severity: url.protocol === 'http:' ? 'high' : 'critical',
            title: `Provider uses unsafe scheme: ${url.protocol}`,
            description: `Provider "${provider.name}" (${provider.id}) uses ${url.protocol} which is not in the safe scheme allowlist.`,
            evidence: {
              providerId: provider.id,
              providerName: provider.name,
              baseUrl: provider.baseUrl,
              scheme: url.protocol,
            },
            resourceType: 'provider',
            resourceId: provider.id,
            detectedAt: new Date().toISOString(),
          });
        }

        const hostname = url.hostname;
        for (const pattern of UNSAFE_HOSTS) {
          if (pattern.test(hostname)) {
            defects.push({
              id: nextDefectId(),
              invariantId: 'INV-006',
              severity: 'high',
              title: `Provider targets unsafe host: ${hostname}`,
              description: `Provider "${provider.name}" (${provider.id}) targets host "${hostname}" which matches an unsafe host pattern.`,
              evidence: {
                providerId: provider.id,
                providerName: provider.name,
                baseUrl: provider.baseUrl,
                hostname,
              },
              resourceType: 'provider',
              resourceId: provider.id,
              detectedAt: new Date().toISOString(),
            });
            break;
          }
        }
      } catch {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-006',
          severity: 'high',
          title: 'Provider has invalid baseUrl',
          description: `Provider "${(provider as Provider).name}" (${(provider as Provider).id}) has a baseUrl that cannot be parsed as a valid URL.`,
          evidence: {
            providerId: (provider as Provider).id,
            baseUrl: (provider as Provider).baseUrl,
          },
          resourceType: 'provider',
          resourceId: (provider as Provider).id,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      invariantId: 'INV-006',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: providers.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} provider endpoint violation(s) found`
        : `All ${providers.length} provider endpoint(s) pass safety checks`,
    };
  }
}
