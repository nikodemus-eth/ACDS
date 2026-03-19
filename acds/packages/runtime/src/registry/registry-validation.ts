/**
 * Pure validation functions for registry inputs.
 *
 * Every function returns void on success and throws
 * InvalidRegistrationError or ValidationFailedError on failure.
 */
import { InvalidRegistrationError, ValidationFailedError } from "../domain/errors.js";
import { PolicyTier } from "../domain/policy-tiers.js";
import type { MethodDefinition } from "../domain/method-registry.js";
import type {
  ProviderRegistrationInput,
  CapabilityRegistrationInput,
  SessionRegistrationInput,
} from "./registry-types.js";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function validateProviderRegistration(input: ProviderRegistrationInput): void {
  if (input.source_class !== "provider") {
    throw new InvalidRegistrationError(
      `Expected source_class "provider", got "${input.source_class}"`,
    );
  }
  if (!input.provider_id || input.provider_id.trim() === "") {
    throw new ValidationFailedError("provider_id is required");
  }
  if (!input.display_name || input.display_name.trim() === "") {
    throw new ValidationFailedError("display_name is required");
  }
  if (!input.execution_mode) {
    throw new ValidationFailedError("execution_mode is required");
  }
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------
export function validateCapabilityRegistration(input: CapabilityRegistrationInput): void {
  if (input.source_class !== "capability") {
    throw new InvalidRegistrationError(
      `Expected source_class "capability", got "${input.source_class}"`,
    );
  }
  if (!input.capability_id || input.capability_id.trim() === "") {
    throw new ValidationFailedError("capability_id is required");
  }
  if (input.explicit_invocation !== true) {
    throw new InvalidRegistrationError(
      "Capabilities must have explicit_invocation set to true",
    );
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export function validateSessionRegistration(input: SessionRegistrationInput): void {
  if (input.source_class !== "session") {
    throw new InvalidRegistrationError(
      `Expected source_class "session", got "${input.source_class}"`,
    );
  }
  if (!input.session_id || input.session_id.trim() === "") {
    throw new ValidationFailedError("session_id is required");
  }
  if (!input.risk_level) {
    throw new InvalidRegistrationError("Session registration requires risk_level metadata");
  }
  if (!input.auth_context) {
    throw new InvalidRegistrationError("Session registration requires auth_context metadata");
  }
  if (!input.expires_at) {
    throw new InvalidRegistrationError("Session registration requires expires_at metadata");
  }
}

// ---------------------------------------------------------------------------
// Method binding
// ---------------------------------------------------------------------------
/**
 * Validates that a method definition is internally consistent and
 * that the referenced provider_id exists in the provided set.
 */
export function validateMethodBinding(
  method: MethodDefinition,
  knownProviderIds: ReadonlySet<string>,
): void {
  if (!method.method_id || method.method_id.trim() === "") {
    throw new ValidationFailedError("method_id is required");
  }
  if (!method.provider_id || method.provider_id.trim() === "") {
    throw new ValidationFailedError("provider_id is required on method");
  }
  if (!knownProviderIds.has(method.provider_id)) {
    throw new InvalidRegistrationError(
      `Method "${method.method_id}" references unknown provider "${method.provider_id}"`,
    );
  }
  if (!method.subsystem || method.subsystem.trim() === "") {
    throw new ValidationFailedError("subsystem is required on method");
  }
  const validTiers: string[] = Object.values(PolicyTier);
  if (!validTiers.includes(method.policy_tier)) {
    throw new ValidationFailedError(
      `Invalid policy_tier "${method.policy_tier}" on method "${method.method_id}"`,
    );
  }
}
