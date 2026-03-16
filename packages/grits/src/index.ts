// GRITS — Governed Runtime Integrity Tracking System

// Types
export type { InvariantId } from './types/InvariantId.js';
export type { Severity } from './types/Severity.js';
export type { Cadence } from './types/Cadence.js';
export type { DefectReport } from './types/DefectReport.js';
export type {
  CheckStatus,
  InvariantCheckResult,
  CheckerResult,
} from './types/CheckerResult.js';
export type {
  OverallStatus,
  DefectCounts,
  IntegritySnapshot,
} from './types/IntegritySnapshot.js';
export type {
  DriftDirection,
  InvariantDrift,
  DriftReport,
} from './types/DriftReport.js';

// Checker Interface
export type { IntegrityChecker } from './checker/IntegrityChecker.js';

// Read-Only Repository Interfaces
export type { IntegritySnapshotRepository } from './repositories/IntegritySnapshotRepository.js';
export type { ExecutionRecordReadRepository } from './repositories/ExecutionRecordReadRepository.js';
export type { RoutingDecisionReadRepository } from './repositories/RoutingDecisionReadRepository.js';
export type { AuditEventReadRepository } from './repositories/AuditEventReadRepository.js';
export type { AdaptationRollbackReadRepository } from './repositories/AdaptationRollbackReadRepository.js';
