// packages/adaptive-optimizer entry point

// State Layer (Prompt 49)
export type { FamilySelectionState, RecentTrend } from './state/FamilySelectionState.js';
export type { CandidatePerformanceState } from './state/CandidatePerformanceState.js';
export { buildCandidateId, parseCandidateId } from './state/CandidatePerformanceState.js';
export type { OptimizerStateRepository } from './state/OptimizerStateRepository.js';

// Ranking Layer (Prompt 50)
export type { RankedCandidate, RankerWeights } from './selection/CandidateRanker.js';
export { rankCandidates } from './selection/CandidateRanker.js';
export type { ExplorationConfig } from './selection/ExplorationPolicy.js';
export { shouldExplore, computeExplorationRate } from './selection/ExplorationPolicy.js';
export { selectExploitation } from './selection/ExploitationPolicy.js';

// Selection Service (Prompt 51)
export type {
  AdaptiveMode,
  AdaptiveSelectionResult,
} from './selection/AdaptiveSelectionService.js';
export { select } from './selection/AdaptiveSelectionService.js';

// Plateau Detection Layer (Prompt 52)
export type {
  PlateauSignal,
  PlateauSeverity,
  PlateauIndicators,
} from './plateau/PlateauSignal.js';
export type { PerformanceSummary, PlateauDetectorConfig } from './plateau/PlateauDetector.js';
export { detect } from './plateau/PlateauDetector.js';

// Adaptation Event and Ledger Layer (Prompt 53)
export type {
  AdaptationEvent,
  AdaptationTrigger,
  PolicyBoundsSnapshot,
  BuildAdaptationEventParams,
} from './adaptation/AdaptationEventBuilder.js';
export { buildAdaptationEvent } from './adaptation/AdaptationEventBuilder.js';
export type {
  AdaptationLedgerWriter,
  AdaptationEventFilters,
} from './adaptation/AdaptationLedgerWriter.js';
export type {
  AdaptationRecommendation,
  RecommendationStatus,
  GenerateRecommendationParams,
} from './adaptation/AdaptationRecommendationService.js';
export { generateRecommendation } from './adaptation/AdaptationRecommendationService.js';

// Adaptation Approval Workflow (Prompt 61)
export type {
  AdaptationApprovalStatus,
  AdaptationApproval,
} from './adaptation/AdaptationApprovalState.js';
export type { AdaptationApprovalRepository } from './adaptation/AdaptationApprovalRepository.js';
export {
  AdaptationApprovalService,
  type ApprovalAuditEventType,
  type ApprovalAuditEvent,
  type ApprovalAuditEmitter,
} from './adaptation/AdaptationApprovalService.js';

// Low-Risk Auto-Apply Mode (Prompt 62)
export type { FamilyRiskLevel } from './adaptation/AdaptiveModePolicy.js';
export { isAutoApplyPermitted } from './adaptation/AdaptiveModePolicy.js';
export type { AutoApplyDecisionRecord } from './adaptation/AutoApplyDecisionRecord.js';
export {
  LowRiskAutoApplyService,
  type LowRiskAutoApplyConfig,
  type FamilyRiskProvider,
  type FamilyPostureProvider,
  type RecentFailureCounter,
  type AutoApplyDecisionWriter,
} from './adaptation/LowRiskAutoApplyService.js';

// Adaptation Rollback Tooling (Prompt 63)
export type {
  RankingSnapshot,
  CandidateRankingEntry,
} from './adaptation/RankingSnapshot.js';
export type { AdaptationRollbackRecord } from './adaptation/AdaptationRollbackRecord.js';
export {
  AdaptationRollbackService,
  type RollbackAuditEventType,
  type RollbackAuditEvent,
  type RollbackAuditEmitter,
  type RollbackRecordWriter,
  type RollbackPreview,
} from './adaptation/AdaptationRollbackService.js';

// Staged Escalation Tuning (Prompt 64)
export type {
  EscalationPreference,
  EscalationTuningState,
} from './adaptation/EscalationTuningState.js';
export {
  evaluateAndTune,
  type PerformanceSummaryForTuning,
  type PolicyConstraints,
} from './adaptation/EscalationTuningService.js';
