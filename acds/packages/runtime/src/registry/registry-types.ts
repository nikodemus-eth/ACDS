/**
 * Registration input interfaces.
 *
 * These are the shapes callers supply when registering
 * providers, capabilities, and sessions with the registry.
 */
import type { ProviderDescriptor, ExecutionMode, HealthStatus, ProviderClass } from "../domain/provider.js";
import type { CapabilityDescriptor } from "../domain/capability.js";
import type { SessionDescriptor, RiskLevel, AuthContext } from "../domain/session.js";
import type { SourceClass } from "../domain/source-types.js";

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------
export interface ProviderRegistrationInput {
  readonly source_class: "provider";
  readonly provider_id: string;
  readonly display_name: string;
  readonly provider_class: ProviderClass;
  readonly execution_mode: ExecutionMode;
  readonly deterministic: boolean;
  readonly health_status: HealthStatus;
  readonly subsystems: readonly string[];
}

// ---------------------------------------------------------------------------
// Capability registration
// ---------------------------------------------------------------------------
export interface CapabilityRegistrationInput {
  readonly source_class: "capability";
  readonly capability_id: string;
  readonly display_name: string;
  readonly explicit_invocation: boolean;
  readonly isolated: boolean;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Session registration
// ---------------------------------------------------------------------------
export interface SessionRegistrationInput {
  readonly source_class: "session";
  readonly session_id: string;
  readonly display_name: string;
  readonly risk_level: RiskLevel;
  readonly risk_acknowledged: boolean;
  readonly auth_context: AuthContext;
  readonly expires_at: string;
}

// ---------------------------------------------------------------------------
// Union of all registration inputs
// ---------------------------------------------------------------------------
export type RegistrationInput =
  | ProviderRegistrationInput
  | CapabilityRegistrationInput
  | SessionRegistrationInput;
