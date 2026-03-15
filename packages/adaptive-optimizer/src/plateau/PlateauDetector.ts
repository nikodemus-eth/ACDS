/**
 * PlateauDetector - Analyzes family and candidate state to determine
 * whether an execution family has reached a performance plateau.
 *
 * A plateau is detected when multiple indicators fire simultaneously,
 * suggesting the current candidate configuration is no longer improving
 * and may be degrading.
 */

import type { FamilySelectionState } from '../state/FamilySelectionState.js';
import type { CandidatePerformanceState } from '../state/CandidatePerformanceState.js';
import type { PlateauSignal, PlateauSeverity, PlateauIndicators } from './PlateauSignal.js';

export interface PerformanceSummary {
  /** Quality score variance over the recent observation window. */
  qualityScoreVariance: number;

  /** Whether cost has been trending upward. */
  costTrendRising: boolean;

  /** Whether human correction burden has been trending upward. */
  correctionBurdenRising: boolean;

  /** Fallback rate as a ratio (0-1). */
  fallbackRate: number;

  /** Minimum acceptable quality score threshold. */
  minimumAcceptableScore: number;
}

export interface PlateauDetectorConfig {
  /** Quality score variance threshold below which quality is "flat" (default 0.01). */
  flatQualityVarianceThreshold: number;

  /** Fallback rate above which repeated fallbacks are flagged (default 0.2). */
  fallbackRateThreshold: number;

  /** Score threshold below which underperformance is flagged (default 0.5). */
  underperformanceScoreThreshold: number;

  /** Number of indicator flags needed for mild severity (default 2). */
  mildThreshold: number;

  /** Number of indicator flags needed for moderate severity (default 3). */
  moderateThreshold: number;

  /** Number of indicator flags needed for severe severity (default 4). */
  severeThreshold: number;
}

const DEFAULT_CONFIG: PlateauDetectorConfig = {
  flatQualityVarianceThreshold: 0.01,
  fallbackRateThreshold: 0.2,
  underperformanceScoreThreshold: 0.5,
  mildThreshold: 2,
  moderateThreshold: 3,
  severeThreshold: 4,
};

/**
 * Counts how many boolean indicator flags are true.
 */
function countActiveIndicators(indicators: PlateauIndicators): number {
  return Object.values(indicators).filter(Boolean).length;
}

/**
 * Determines severity based on the number of active indicators.
 */
function classifySeverity(
  activeCount: number,
  config: PlateauDetectorConfig,
): PlateauSeverity {
  if (activeCount >= config.severeThreshold) return 'severe';
  if (activeCount >= config.moderateThreshold) return 'moderate';
  if (activeCount >= config.mildThreshold) return 'mild';
  return 'none';
}

/**
 * Detects whether an execution family has reached a performance plateau.
 *
 * @param familyState - Current family selection state.
 * @param candidateStates - All candidate performance states for the family.
 * @param performanceSummary - Aggregated performance metrics over the observation window.
 * @param config - Optional configuration overrides.
 * @returns A PlateauSignal describing the detection result.
 */
export function detect(
  familyState: FamilySelectionState,
  candidateStates: CandidatePerformanceState[],
  performanceSummary: PerformanceSummary,
  config: Partial<PlateauDetectorConfig> = {},
): PlateauSignal {
  const c: PlateauDetectorConfig = { ...DEFAULT_CONFIG, ...config };

  // Compute the average rolling score across all candidates
  const avgScore =
    candidateStates.length > 0
      ? candidateStates.reduce((sum, cs) => sum + cs.rollingScore, 0) / candidateStates.length
      : familyState.rollingScore;

  const indicators: PlateauIndicators = {
    flatQuality: performanceSummary.qualityScoreVariance < c.flatQualityVarianceThreshold,
    risingCost: performanceSummary.costTrendRising,
    risingCorrectionBurden: performanceSummary.correctionBurdenRising,
    repeatedFallbacks: performanceSummary.fallbackRate > c.fallbackRateThreshold,
    persistentUnderperformance: avgScore < c.underperformanceScoreThreshold,
  };

  const activeCount = countActiveIndicators(indicators);
  const severity = classifySeverity(activeCount, c);
  const detected = severity !== 'none';

  return {
    familyKey: familyState.familyKey,
    detected,
    severity,
    indicators,
    detectedAt: new Date().toISOString(),
  };
}
