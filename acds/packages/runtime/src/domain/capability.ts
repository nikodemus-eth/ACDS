/**
 * Capability-specific domain types.
 */

export interface CapabilityDescriptor {
  readonly capability_id: string;
  readonly display_name: string;
  /** Must always be true -- capabilities require explicit invocation. */
  readonly explicit_invocation: boolean;
  /** Whether this capability runs in an isolated sandbox. */
  readonly isolated: boolean;
  /** Brief description of what this capability provides. */
  readonly description: string;
}
