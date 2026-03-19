/**
 * GRITS Adversarial Tests
 * GRITS-ADV-001 through GRITS-ADV-007
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { Registry } from "../../src/registry/registry.js";
import {
  PolicyBlockedError,
  CrossClassFallbackBlockedError,
  InvalidRegistrationError,
} from "../../src/domain/errors.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";
import { AuditLogger } from "../../src/telemetry/audit-logger.js";
import { redact } from "../../src/telemetry/redaction.js";

describe("GRITS Adversarial Tests", () => {
  it("GRITS-ADV-001: silent capability escalation from provider request blocked + logged", async () => {
    const registry = createDefaultRegistry();
    const auditLogger = new AuditLogger();

    // Attempt to escalate a provider-targeted request to a capability
    // by adding use_capability without explicit_approval
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_capability: "external-llm-backdoor",
          // no explicit_approval — this should be blocked
        },
        registry,
        undefined,
        { auditLogger },
      ),
    ).rejects.toThrow(PolicyBlockedError);

    // The denial should be logged
    const events = auditLogger.getEvents();
    const denials = events.filter((e) => e.event_type === "policy_denied");
    expect(denials.length).toBe(1);
    expect(denials[0].status).toBe("blocked");
  });

  it("GRITS-ADV-002: cross-class fallback injection via malformed plan rejected", async () => {
    const registry = createDefaultRegistry();

    // Try to inject a capability fallback into a provider-class request
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          fallback_method_id: "injected-capability",
          fallback_source_class: "capability",
        },
        registry,
      ),
    ).rejects.toThrow(CrossClassFallbackBlockedError);
  });

  it("GRITS-ADV-003: Tier D execution in local-only mode blocked", async () => {
    const registry = createDefaultRegistry();

    // Register a Tier D method
    registry.registerMethod({
      method_id: "apple.external.search",
      provider_id: "apple-intelligence-runtime",
      subsystem: "text",
      deterministic: false,
      requires_network: true,
      policy_tier: "D" as any,
      input_schema: {},
      output_schema: {},
    });

    const { evaluatePolicy } = await import("../../src/runtime/policy-engine.js");

    const decision = evaluatePolicy(
      {
        method_id: "apple.external.search",
        provider_id: "apple-intelligence-runtime",
        source_class: "provider",
      },
      registry,
      { local_only: true },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("TIER_D_BLOCKED_SOVEREIGN");
  });

  it("GRITS-ADV-004: register session as provider rejected", () => {
    const registry = new Registry();

    expect(() =>
      registry.registerProvider({
        source_class: "session" as any,
        provider_id: "session-as-provider",
        display_name: "Session Masquerading as Provider",
        provider_class: "local_runtime",
        execution_mode: "local",
        deterministic: true,
        health_status: "healthy",
        subsystems: ["text"],
      }),
    ).toThrow(InvalidRegistrationError);
  });

  it("GRITS-ADV-005: log poisoning with token-like strings — redacted, structure preserved", () => {
    const poisonedEvent = {
      event_id: "evt-123",
      event_type: "execution_started" as const,
      timestamp: new Date().toISOString(),
      execution_id: "exec-456",
      source_type: "provider" as const,
      source_id: "apple-intelligence-runtime",
      status: "success" as const,
      details: {
        token: "sk_live_abcdefghijklmnopqrstuvwxyz1234567890",
        secret: "super_secret_key_that_is_longer_than_20_chars",
        api_key: "AIzaSyAbcdefghijklmnopqrstuvwxyz1234567890",
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        credential: "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
        safe_field: "This is a normal value",
        password: "MyP@ssword!ThatIsVeryLongAndSecret123",
        nested: {
          token: "nested_token_abcdefghijklmnopqrstuvwxyz",
          normal: "just a normal nested value",
        },
      },
    };

    const redacted = redact(poisonedEvent);

    // Structure preserved
    expect(redacted.event_id).toBe("evt-123");
    expect(redacted.event_type).toBe("execution_started");
    expect(redacted.execution_id).toBe("exec-456");

    // Sensitive fields redacted
    const details = redacted.details as Record<string, unknown>;
    expect(details.token).toBe("[REDACTED]");
    expect(details.secret).toBe("[REDACTED]");
    expect(details.api_key).toBe("[REDACTED]");
    expect(details.authorization).toBe("[REDACTED]");
    expect(details.credential).toBe("[REDACTED]");
    expect(details.password).toBe("[REDACTED]");
    expect(details.safe_field).toBe("This is a normal value");

    // Nested redaction
    const nested = details.nested as Record<string, unknown>;
    expect(nested.token).toBe("[REDACTED]");
    expect(nested.normal).toBe("just a normal nested value");
  });

  it("GRITS-ADV-006: bypass risk acknowledgment for session denied", async () => {
    const registry = createDefaultRegistry();

    // Attempt session path without risk acknowledgment
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_session: "malicious-session",
          risk_acknowledged: false,
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("GRITS-ADV-007: coerce capability via provider failure — no external escalation, same-class fallback only", async () => {
    const registry = createDefaultRegistry();

    // When a provider fails and a capability fallback is attempted,
    // cross-class fallback should be blocked
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          fallback_method_id: "external-capability",
          fallback_source_class: "capability",
        },
        registry,
      ),
    ).rejects.toThrow(CrossClassFallbackBlockedError);

    // Same-class fallback should be allowed (provider -> provider)
    // This should not throw at the planning stage
    const response = await executeRequest(
      {
        task: "summarize this document",
        fallback_method_id: "apple.writing.summarize",
        fallback_source_class: "provider",
      },
      registry,
    );
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
  });
});
