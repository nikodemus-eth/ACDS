import { InMemoryExecutionRecordReadRepository } from './InMemoryExecutionRecordReadRepository.js';
import { InMemoryRoutingDecisionReadRepository } from './InMemoryRoutingDecisionReadRepository.js';
import { InMemoryAuditEventReadRepository } from './InMemoryAuditEventReadRepository.js';
import { InMemoryAdaptationRollbackReadRepository } from './InMemoryAdaptationRollbackReadRepository.js';
import { InMemoryIntegritySnapshotRepository } from './InMemoryIntegritySnapshotRepository.js';
import { getSharedOptimizerStateRepository, getSharedApprovalRepository, getSharedLedger, getSharedProviderRepository, getSharedPolicyRepository } from './sharedRepositories.js';
import type { GritsRepositoryContext } from './createPgRepositoryContext.js';

export function createFixtureRepositoryContext(): GritsRepositoryContext {
  return {
    execRepo: new InMemoryExecutionRecordReadRepository(),
    routingRepo: new InMemoryRoutingDecisionReadRepository(),
    auditRepo: new InMemoryAuditEventReadRepository(),
    rollbackRepo: new InMemoryAdaptationRollbackReadRepository(),
    snapshotRepo: new InMemoryIntegritySnapshotRepository(),
    optimizerRepo: getSharedOptimizerStateRepository(),
    approvalRepo: getSharedApprovalRepository(),
    ledger: getSharedLedger(),
    providerRepo: getSharedProviderRepository(),
    policyRepo: getSharedPolicyRepository(),
  };
}
