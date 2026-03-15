// Metrics
export type { MetricResult } from './metrics/AcceptanceMetric.js';
export type { AcceptanceOutcome, AcceptanceRecord } from './metrics/AcceptanceMetric.js';
export { evaluateAcceptance } from './metrics/AcceptanceMetric.js';

export type { ComplianceLevel, SchemaComplianceRecord } from './metrics/SchemaComplianceMetric.js';
export { evaluateSchemaCompliance } from './metrics/SchemaComplianceMetric.js';

export type { CorrectionRecord } from './metrics/CorrectionBurdenMetric.js';
export { evaluateCorrectionBurden } from './metrics/CorrectionBurdenMetric.js';

export type { LatencyRecord, LatencyThresholds } from './metrics/LatencyMetric.js';
export { evaluateLatency } from './metrics/LatencyMetric.js';

export type { CostRecord, CostThresholds } from './metrics/CostMetric.js';
export { evaluateCost } from './metrics/CostMetric.js';

export type { UnsupportedClaimRecord } from './metrics/UnsupportedClaimMetric.js';
export { evaluateUnsupportedClaims } from './metrics/UnsupportedClaimMetric.js';

// Scoring
export type { WeightConfig, ExecutionScore } from './scoring/ExecutionScoreCalculator.js';
export { calculateExecutionScore } from './scoring/ExecutionScoreCalculator.js';

export type { KnownApplication } from './scoring/ApplicationWeightResolver.js';
export { resolveApplicationWeights } from './scoring/ApplicationWeightResolver.js';

export type { TrendDirection, ImprovementSignal } from './scoring/ImprovementSignalBuilder.js';
export { buildImprovementSignal } from './scoring/ImprovementSignalBuilder.js';

// Aggregation
export type { WindowStats } from './aggregation/ExecutionHistoryAggregator.js';
export { ExecutionHistoryAggregator } from './aggregation/ExecutionHistoryAggregator.js';

export type {
  MetricTrend,
  FamilyPerformanceSummary,
} from './aggregation/FamilyPerformanceSummary.js';
export { buildFamilyPerformanceSummary } from './aggregation/FamilyPerformanceSummary.js';
