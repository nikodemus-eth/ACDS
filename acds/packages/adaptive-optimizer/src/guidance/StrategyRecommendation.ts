/**
 * StrategyRecommendation - Represents a suggested strategy change
 * for an execution family based on plateau detection signals.
 */

export type StrategyType =
  | 'split_task'
  | 'insert_critique'
  | 'escalate_model'
  | 'change_scaffold'
  | 'enable_multi_stage';

export interface StrategyRecommendation {
  /** Unique identifier for this recommendation. */
  id: string;
  /** The execution family this recommendation targets. */
  familyKey: string;
  /** The type of strategy being recommended. */
  strategyType: StrategyType;
  /** Human-readable description of the recommendation. */
  description: string;
  /** Expected impact level of applying this strategy. */
  expectedImpact: 'low' | 'medium' | 'high';
  /** ISO-8601 timestamp of when this recommendation was generated. */
  createdAt: string;
}
