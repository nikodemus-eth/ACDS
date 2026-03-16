/**
 * AutoApplyDecisionRecord - Captures the outcome of an automatic
 * ranking application performed by the LowRiskAutoApplyService.
 */

import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';
import type { FamilyRiskLevel } from './AdaptiveModePolicy.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';

export interface AutoApplyDecisionRecord {
  /** Unique identifier for this decision. */
  id: string;

  /** The execution family the auto-apply was performed on. */
  familyKey: string;

  /** Candidate ranking before the auto-apply. */
  previousRanking: RankedCandidate[];

  /** Candidate ranking after the auto-apply. */
  newRanking: RankedCandidate[];

  /** Human-readable explanation of why auto-apply was performed. */
  reason: string;

  /** The adaptive mode in effect when the decision was made. */
  mode: AdaptiveMode;

  /** The risk basis that qualified this family for auto-apply. */
  riskBasis: FamilyRiskLevel;

  /** ISO-8601 timestamp of when the auto-apply was executed. */
  appliedAt: string;
}
