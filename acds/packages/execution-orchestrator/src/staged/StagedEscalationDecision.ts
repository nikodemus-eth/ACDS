/**
 * StagedEscalationDecision - Represents the outcome of translating an
 * escalation tuning state into a concrete escalation decision for the
 * execution orchestrator's staged pipeline.
 */

import type { EscalationPreference } from '@acds/adaptive-optimizer';

export interface StagedEscalationDecision {
  /** The execution family this decision applies to. */
  familyKey: string;

  /** The escalation preference from the tuning service. */
  escalationPreference: EscalationPreference;

  /**
   * If true, a hard policy override is in effect and the preference
   * is dictated by policy rather than tuning.
   */
  policyOverride: boolean;

  /** Human-readable explanation of the decision. */
  reason: string;

  /** ISO-8601 timestamp of when this decision was made. */
  decidedAt: string;
}
