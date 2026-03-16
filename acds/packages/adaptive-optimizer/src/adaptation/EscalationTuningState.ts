/**
 * EscalationTuningState - Represents the per-family escalation preference
 * as determined by the EscalationTuningService.
 *
 * This state influences when and how aggressively the staged escalation
 * pipeline promotes work from local to escalated execution paths.
 */

/**
 * The escalation preference for a family.
 *
 * - early_escalate:           Prefer escalating sooner rather than later.
 * - normal_escalate:          Standard escalation timing.
 * - delayed_escalate:         Prefer exhausting local options before escalating.
 * - local_preferred_until_fail: Only escalate after local execution fails.
 */
export type EscalationPreference =
  | 'early_escalate'
  | 'normal_escalate'
  | 'delayed_escalate'
  | 'local_preferred_until_fail';

export interface EscalationTuningState {
  /** The execution family this tuning applies to. */
  familyKey: string;

  /** The tuned escalation preference. */
  preference: EscalationPreference;

  /** Confidence score (0-1) in the current preference based on evidence. */
  confidence: number;

  /** ISO-8601 timestamp of the last evaluation. */
  lastEvaluatedAt: string;
}
