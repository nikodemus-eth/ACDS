import type { IntegritySnapshotRepository, ExecutionRecordReadRepository, RoutingDecisionReadRepository, AuditEventReadRepository, AdaptationRollbackReadRepository } from '@acds/grits';
import type { OptimizerStateRepository, AdaptationApprovalRepository, AdaptationLedgerWriter, AdaptationEvent, AdaptationEventFilters } from '@acds/adaptive-optimizer';
import type { ProviderRepository } from '@acds/provider-broker';
import type { PgPolicyRepository as PolicyRepository } from '@acds/persistence-pg';
import {
  PgOptimizerStateRepository,
  PgAdaptationApprovalRepository,
  PgProviderRepository,
  PgPolicyRepository,
} from '@acds/persistence-pg';
import { createWorkerPool } from './createWorkerPool.js';
import { PgExecutionRecordReadRepository } from './PgExecutionRecordReadRepository.js';
import { PgRoutingDecisionReadRepository } from './PgRoutingDecisionReadRepository.js';
import { PgAuditEventReadRepository } from './PgAuditEventReadRepository.js';
import { PgAdaptationRollbackReadRepository } from './PgAdaptationRollbackReadRepository.js';
import { PgIntegritySnapshotRepository } from './PgIntegritySnapshotRepository.js';

export interface GritsRepositoryContext {
  execRepo: ExecutionRecordReadRepository;
  routingRepo: RoutingDecisionReadRepository;
  auditRepo: AuditEventReadRepository;
  rollbackRepo: AdaptationRollbackReadRepository;
  snapshotRepo: IntegritySnapshotRepository;
  optimizerRepo: OptimizerStateRepository;
  approvalRepo: AdaptationApprovalRepository;
  ledger: AdaptationLedgerWriter;
  providerRepo: ProviderRepository;
  policyRepo: PolicyRepository;
}

class PgAdaptationLedger implements AdaptationLedgerWriter {
  constructor(private readonly policyPool: ReturnType<typeof createWorkerPool>) {}

  async writeEvent(): Promise<void> {
    throw new Error('GRITS release mode is read-only; adaptation event writes are not supported in this context.');
  }

  async listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    const params: unknown[] = [familyKey];
    const conditions = ['family_key = $1'];
    let index = 2;

    if (filters?.since) {
      conditions.push(`applied_at >= $${index++}`);
      params.push(filters.since);
    }
    if (filters?.until) {
      conditions.push(`applied_at <= $${index++}`);
      params.push(filters.until);
    }

    let sql = `SELECT id, family_key, reason, mode, risk_basis, applied_at FROM auto_apply_decision_records WHERE ${conditions.join(' AND ')} ORDER BY applied_at DESC`;
    if (filters?.limit) {
      sql += ` LIMIT $${index}`;
      params.push(filters.limit);
    }

    const result = await this.policyPool.query(
      sql,
      params,
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapEvent(row));
  }

  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    const result = await this.policyPool.query(
      `SELECT id, family_key, reason, mode, risk_basis, applied_at
       FROM auto_apply_decision_records
       WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return this.mapEvent(result.rows[0]);
  }

  private mapEvent(row: Record<string, unknown>): AdaptationEvent {
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      previousRanking: [],
      newRanking: [],
      trigger: 'manual',
      evidenceSummary: (row.risk_basis as string) ?? 'release-gate replay',
      mode: ((row.mode as string) ?? 'observe_only') as AdaptationEvent['mode'],
      policyBoundsSnapshot: {
        explorationRate: 0,
        mode: ((row.mode as string) ?? 'observe_only') as AdaptationEvent['mode'],
        additionalConstraints: {},
      },
      createdAt: new Date(row.applied_at as string).toISOString(),
    };
  }
}

const pool = createWorkerPool();

const context: GritsRepositoryContext = {
  execRepo: new PgExecutionRecordReadRepository(pool),
  routingRepo: new PgRoutingDecisionReadRepository(pool),
  auditRepo: new PgAuditEventReadRepository(pool),
  rollbackRepo: new PgAdaptationRollbackReadRepository(pool),
  snapshotRepo: new PgIntegritySnapshotRepository(pool),
  optimizerRepo: new PgOptimizerStateRepository(pool),
  approvalRepo: new PgAdaptationApprovalRepository(pool),
  ledger: new PgAdaptationLedger(pool),
  providerRepo: new PgProviderRepository(pool),
  policyRepo: new PgPolicyRepository(pool),
};

export function createPgRepositoryContext(): GritsRepositoryContext {
  return context;
}
