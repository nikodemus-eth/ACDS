/**
 * Central ACDS Registry.
 *
 * Stores providers, capabilities, sessions, and method definitions.
 * Enforces class separation and validates all inputs on registration.
 */
import type { ProviderDescriptor } from "../domain/provider.js";
import type { CapabilityDescriptor } from "../domain/capability.js";
import type { SessionDescriptor } from "../domain/session.js";
import type { MethodDefinition } from "../domain/method-registry.js";
import { InvalidRegistrationError } from "../domain/errors.js";
import type {
  ProviderRegistrationInput,
  CapabilityRegistrationInput,
  SessionRegistrationInput,
} from "./registry-types.js";
import {
  validateProviderRegistration,
  validateCapabilityRegistration,
  validateSessionRegistration,
  validateMethodBinding,
} from "./registry-validation.js";

export class Registry {
  private readonly providers = new Map<string, ProviderDescriptor>();
  private readonly capabilities = new Map<string, CapabilityDescriptor>();
  private readonly sessions = new Map<string, SessionDescriptor>();
  private readonly methods = new Map<string, MethodDefinition>();

  // -----------------------------------------------------------------------
  // Provider
  // -----------------------------------------------------------------------
  registerProvider(input: ProviderRegistrationInput): ProviderDescriptor {
    validateProviderRegistration(input);
    if (this.providers.has(input.provider_id)) {
      throw new InvalidRegistrationError(
        `Provider already registered: ${input.provider_id}`,
      );
    }
    const descriptor: ProviderDescriptor = {
      provider_id: input.provider_id,
      display_name: input.display_name,
      provider_class: input.provider_class,
      execution_mode: input.execution_mode,
      deterministic: input.deterministic,
      health_status: input.health_status,
      subsystems: [...input.subsystems],
    };
    this.providers.set(input.provider_id, descriptor);
    return descriptor;
  }

  getProvider(id: string): ProviderDescriptor | undefined {
    return this.providers.get(id);
  }

  listProviders(): readonly ProviderDescriptor[] {
    return [...this.providers.values()];
  }

  // -----------------------------------------------------------------------
  // Capability
  // -----------------------------------------------------------------------
  registerCapability(input: CapabilityRegistrationInput): CapabilityDescriptor {
    validateCapabilityRegistration(input);
    if (this.capabilities.has(input.capability_id)) {
      throw new InvalidRegistrationError(
        `Capability already registered: ${input.capability_id}`,
      );
    }
    const descriptor: CapabilityDescriptor = {
      capability_id: input.capability_id,
      display_name: input.display_name,
      explicit_invocation: input.explicit_invocation,
      isolated: input.isolated,
      description: input.description,
    };
    this.capabilities.set(input.capability_id, descriptor);
    return descriptor;
  }

  getCapability(id: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(id);
  }

  listCapabilities(): readonly CapabilityDescriptor[] {
    return [...this.capabilities.values()];
  }

  // -----------------------------------------------------------------------
  // Session
  // -----------------------------------------------------------------------
  registerSession(input: SessionRegistrationInput): SessionDescriptor {
    validateSessionRegistration(input);
    if (this.sessions.has(input.session_id)) {
      throw new InvalidRegistrationError(
        `Session already registered: ${input.session_id}`,
      );
    }
    const descriptor: SessionDescriptor = {
      session_id: input.session_id,
      display_name: input.display_name,
      risk_level: input.risk_level,
      risk_acknowledged: input.risk_acknowledged,
      auth_context: input.auth_context,
      expires_at: input.expires_at,
    };
    this.sessions.set(input.session_id, descriptor);
    return descriptor;
  }

  getSession(id: string): SessionDescriptor | undefined {
    return this.sessions.get(id);
  }

  listSessions(): readonly SessionDescriptor[] {
    return [...this.sessions.values()];
  }

  // -----------------------------------------------------------------------
  // Methods
  // -----------------------------------------------------------------------
  registerMethod(method: MethodDefinition): MethodDefinition {
    const providerIds = new Set(this.providers.keys());
    validateMethodBinding(method, providerIds);

    if (this.methods.has(method.method_id)) {
      throw new InvalidRegistrationError(
        `Method already registered: ${method.method_id}`,
      );
    }
    this.methods.set(method.method_id, method);
    return method;
  }

  getMethod(methodId: string): MethodDefinition | undefined {
    return this.methods.get(methodId);
  }

  getMethodsForProvider(providerId: string): readonly MethodDefinition[] {
    return [...this.methods.values()].filter(
      (m) => m.provider_id === providerId,
    );
  }
}
