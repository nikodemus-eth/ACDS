/**
 * Identifiers for the core invariants that GRITS verifies.
 */
export type InvariantId =
  | 'INV-001' // Execution must not occur outside eligibility bounds
  | 'INV-002' // Fallback chain never escapes policy bounds
  | 'INV-003' // Adaptive selection cannot touch ineligible candidates
  | 'INV-004' // Approval/rollback state machines reject invalid transitions
  | 'INV-005' // No plaintext secret exposure in logs/responses/audit
  | 'INV-006' // Provider endpoints restricted to safe schemes and hosts
  | 'INV-007' // Every control action has a complete audit trail entry
  | 'INV-008'; // Client metadata cannot spoof posture or escalation
