import 'fastify';
import type { ProviderHealthService, ProviderRegistryService, ProviderConnectionTester } from '@acds/provider-broker';
import type { SecretRotationService } from '@acds/security';
import type { DispatchRunService, ExecutionRecordService } from '@acds/execution-orchestrator';
import type { AdaptationRollbackService, AdaptationApprovalRepository, ApprovalAuditEmitter } from '@acds/adaptive-optimizer';
import type { PgPolicyRepository } from '@acds/persistence-pg';
import type { ProfileCatalogService } from '../services/ProfileCatalogService.js';
import type { AuditEventReader } from '../controllers/AuditController.js';
import type {
  FamilyPerformanceReader,
  CandidateRankingReader,
  AdaptationEventReader,
  AdaptationRecommendationReader,
} from '../controllers/AdaptationController.js';

interface DiContainer {
  providerHealthService: ProviderHealthService;
  registryService: ProviderRegistryService;
  profileCatalogService: ProfileCatalogService;
  policyRepository: PgPolicyRepository;
  connectionTester: Pick<ProviderConnectionTester, 'testConnection'>;
  secretRotationService: SecretRotationService;
  dispatchRunService: DispatchRunService;
  executionRecordService: ExecutionRecordService;
  auditEventReader: AuditEventReader;
  familyPerformanceReader: FamilyPerformanceReader;
  candidateRankingReader: CandidateRankingReader;
  adaptationEventReader: AdaptationEventReader;
  adaptationRecommendationReader: AdaptationRecommendationReader;
  adaptationApprovalRepository: AdaptationApprovalRepository;
  approvalAuditEmitter: ApprovalAuditEmitter;
  adaptationRollbackService: AdaptationRollbackService;
  resolve<T>(name: string): T;
  [key: string]: unknown;
}

declare module 'fastify' {
  interface FastifyInstance {
    diContainer?: DiContainer;
    config: import('../config/appConfig').AppConfig;
  }
}
