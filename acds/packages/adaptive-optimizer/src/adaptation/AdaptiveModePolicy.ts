/**
 * AdaptiveModePolicy - Defines which adaptive modes permit automatic
 * application of ranking changes and how family risk level gates
 * auto-apply decisions.
 *
 * No provider execution occurs here; this is purely a policy lookup.
 */

import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';

/**
 * Risk classification for an execution family.
 *
 * - low:    Routine tasks where auto-apply is safe.
 * - medium: Tasks with moderate consequence; auto-apply is gated.
 * - high:   High-consequence families; auto-apply is never permitted.
 */
export type FamilyRiskLevel = 'low' | 'medium' | 'high';

/**
 * Modes in which auto-apply is structurally permitted (before risk gating).
 */
const AUTO_APPLY_MODES: ReadonlySet<AdaptiveMode> = new Set<AdaptiveMode>([
  'auto_apply_low_risk',
  'fully_applied',
]);

/**
 * Returns true if the given adaptive mode and family risk level together
 * permit the optimizer to automatically apply a ranking change without
 * human approval.
 *
 * Rules:
 * - `observe_only` and `recommend_only` never permit auto-apply.
 * - `auto_apply_low_risk` permits auto-apply only for low-risk families.
 * - `fully_applied` permits auto-apply for low and medium risk families.
 *   High-risk families still require human approval even in fully_applied
 *   mode to prevent catastrophic changes.
 */
export function isAutoApplyPermitted(mode: AdaptiveMode, familyRisk: FamilyRiskLevel): boolean {
  if (!AUTO_APPLY_MODES.has(mode)) {
    return false;
  }

  if (familyRisk === 'high') {
    return false;
  }

  if (mode === 'auto_apply_low_risk' && familyRisk !== 'low') {
    return false;
  }

  return true;
}
