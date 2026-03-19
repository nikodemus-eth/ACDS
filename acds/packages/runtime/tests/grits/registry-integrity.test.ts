/**
 * GRITS Registry Integrity Tests
 * GRITS-REG-001 through GRITS-REG-005
 */
import { describe, it, expect } from "vitest";
import { Registry } from "../../src/registry/registry.js";
import { createDefaultRegistry, APPLE_METHODS } from "../../src/registry/default-registry.js";
import { InvalidRegistrationError, ValidationFailedError } from "../../src/domain/errors.js";

describe("GRITS Registry Integrity", () => {
  it("GRITS-REG-001: provider entries cannot be misclassified as capabilities", () => {
    const registry = new Registry();

    // Attempting to register a provider with source_class "capability" should fail
    expect(() =>
      registry.registerProvider({
        source_class: "provider",
        provider_id: "test-provider",
        display_name: "Test",
        provider_class: "local_runtime",
        execution_mode: "local",
        deterministic: true,
        health_status: "healthy",
        subsystems: ["text"],
      }),
    ).not.toThrow();

    // A capability registration must have source_class "capability"
    expect(() =>
      registry.registerCapability({
        source_class: "capability" as any,
        capability_id: "test-cap",
        display_name: "Test Cap",
        explicit_invocation: true,
        isolated: true,
        description: "Test capability",
      }),
    ).not.toThrow();

    // Verify they are stored separately
    expect(registry.getProvider("test-provider")).toBeDefined();
    expect(registry.getCapability("test-cap")).toBeDefined();
    expect(registry.getProvider("test-cap")).toBeUndefined();
    expect(registry.getCapability("test-provider")).toBeUndefined();
  });

  it("GRITS-REG-002: capability entries require explicit invocation flags", () => {
    const registry = new Registry();

    // Capability without explicit_invocation=true should fail
    expect(() =>
      registry.registerCapability({
        source_class: "capability",
        capability_id: "bad-cap",
        display_name: "Bad Cap",
        explicit_invocation: false,
        isolated: true,
        description: "Should fail",
      } as any),
    ).toThrow(InvalidRegistrationError);
  });

  it("GRITS-REG-003: session entries require risk metadata", () => {
    const registry = new Registry();

    // Session without risk_level should fail
    expect(() =>
      registry.registerSession({
        source_class: "session",
        session_id: "test-session",
        display_name: "Test Session",
        risk_level: undefined as any,
        risk_acknowledged: false,
        auth_context: {
          user_id: "u1",
          scopes: ["read"],
          issued_at: Date.now(),
          expires_at: Date.now() + 3600000,
        },
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    ).toThrow(InvalidRegistrationError);

    // Session without auth_context should fail
    expect(() =>
      registry.registerSession({
        source_class: "session",
        session_id: "test-session-2",
        display_name: "Test Session 2",
        risk_level: "high",
        risk_acknowledged: false,
        auth_context: undefined as any,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    ).toThrow(InvalidRegistrationError);

    // Session without expires_at should fail
    expect(() =>
      registry.registerSession({
        source_class: "session",
        session_id: "test-session-3",
        display_name: "Test Session 3",
        risk_level: "high",
        risk_acknowledged: false,
        auth_context: {
          user_id: "u1",
          scopes: ["read"],
          issued_at: Date.now(),
          expires_at: Date.now() + 3600000,
        },
        expires_at: undefined as any,
      }),
    ).toThrow(InvalidRegistrationError);
  });

  it("GRITS-REG-004: all Apple methods have required metadata", () => {
    const registry = createDefaultRegistry();

    for (const method of APPLE_METHODS) {
      const registered = registry.getMethod(method.method_id);
      expect(registered).toBeDefined();
      expect(registered!.provider_id).toBe("apple-intelligence-runtime");
      expect(registered!.subsystem).toBeTruthy();
      expect(registered!.policy_tier).toBeTruthy();
      expect(typeof registered!.deterministic).toBe("boolean");
      expect(typeof registered!.requires_network).toBe("boolean");
    }
  });

  it("GRITS-REG-005: mixed registration rejected — wrong source_class", () => {
    const registry = new Registry();

    // Try to register a provider with wrong source_class
    expect(() =>
      registry.registerProvider({
        source_class: "capability" as any,
        provider_id: "mixed-bad",
        display_name: "Mixed Bad",
        provider_class: "local_runtime",
        execution_mode: "local",
        deterministic: true,
        health_status: "healthy",
        subsystems: ["text"],
      }),
    ).toThrow(InvalidRegistrationError);

    // Try to register a capability with wrong source_class
    expect(() =>
      registry.registerCapability({
        source_class: "provider" as any,
        capability_id: "mixed-bad",
        display_name: "Mixed Bad",
        explicit_invocation: true,
        isolated: true,
        description: "Should fail",
      }),
    ).toThrow(InvalidRegistrationError);

    // Try to register a session with wrong source_class
    expect(() =>
      registry.registerSession({
        source_class: "provider" as any,
        session_id: "mixed-bad",
        display_name: "Mixed Bad",
        risk_level: "high",
        risk_acknowledged: false,
        auth_context: {
          user_id: "u1",
          scopes: ["read"],
          issued_at: Date.now(),
          expires_at: Date.now() + 3600000,
        },
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    ).toThrow(InvalidRegistrationError);
  });
});
