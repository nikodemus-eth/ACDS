/**
 * StagedEscalationPolicyBridge - Translates an EscalationTuningState into
 * a StagedEscalationDecision, preserving hard policy stops.
 *
 * This bridge ensures that no tuning preference can bypass forced
 * escalation requirements imposed by the policy engine. For postures
 * like final or evidentiary, escalation is always forced regardless
 * of what the tuning service recommends.
 */

import type { EscalationTuningState } from '@acds/adaptive-optimizer';
import type { StagedEscalationDecision } from './StagedEscalationDecision.js';

// ── Policy constraints for the bridge ──────────────────────────────────────

export interface StagedPolicyConstraints {
  /** If true, escalation is mandated by policy and cannot be overridden. */
  forcedEscalation: boolean;

  /** The posture that triggered forced escalation (if applicable). */
  posture?: string;

  /** Maximum allowed preference when policy permits tuning. */
  maxPermittedPreference?: 'early_escalate' | 'normal_escalate' | 'delayed_escalate' | 'local_preferred_until_fail';
}

// ── Preference ordering for clamping ───────────────────────────────────────

const PREFERENCE_ORDER = [
  'early_escalate',
  'normal_escalate',
  'delayed_escalate',
  'local_preferred_until_fail',
] as const;

function preferenceIndex(pref: string): number {
  const idx = PREFERENCE_ORDER.indexOf(pref as any);
  return idx >= 0 ? idx : 1; // default to normal_escalate
}

// ── Bridge function ────────────────────────────────────────────────────────

/**
 * Translates an EscalationTuningState into a StagedEscalationDecision,
 * applying hard policy stops where required.
 *
 * @param tuningState - The tuned escalation preference from the optimizer.
 * @param constraints - Policy constraints from the policy engine.
 * @returns A StagedEscalationDecision for the execution orchestrator.
 */
export function translateTuning(
  tuningState: EscalationTuningState,
  constraints: StagedPolicyConstraints,
): StagedEscalationDecision {
  const now = new Date().toISOString();

  // Hard policy stop: forced escalation overrides all tuning
  if (constraints.forcedEscalation) {
    return {
      familyKey: tuningState.familyKey,
      escalationPreference: 'early_escalate',
      policyOverride: true,
      reason: `Forced escalation: policy requires immediate escalation for posture '${constraints.posture ?? 'unknown'}'.`,
      decidedAt: now,
    };
  }

  let effectivePreference = tuningState.preference;
  let policyOverride = false;
  let reason = `Tuned preference: ${tuningState.preference} (confidence: ${tuningState.confidence.toFixed(2)}).`;

  // Clamp preference if policy imposes a maximum
  if (constraints.maxPermittedPreference) {
    const maxIdx = preferenceIndex(constraints.maxPermittedPreference);
    const currentIdx = preferenceIndex(effectivePreference);

    if (currentIdx > maxIdx) {
      effectivePreference = constraints.maxPermittedPreference;
      policyOverride = true;
      reason = `Tuned preference '${tuningState.preference}' clamped to '${effectivePreference}' by policy constraint.`;
    }
  }

  return {
    familyKey: tuningState.familyKey,
    escalationPreference: effectivePreference,
    policyOverride,
    reason,
    decidedAt: now,
  };
}
