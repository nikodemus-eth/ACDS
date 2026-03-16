/**
 * Severity classification for GRITS defect reports.
 */
export type Severity =
  | 'critical' // Governance or security guarantee broken
  | 'high'     // Major correctness risk
  | 'medium'   // Integrity degradation
  | 'low'      // Minor inconsistency, no immediate impact
  | 'info';    // Informational finding, no action required
