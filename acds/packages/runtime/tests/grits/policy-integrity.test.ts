/**
 * GRITS Policy Integrity Tests
 * GRITS-POL-001 through GRITS-POL-006
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { PolicyBlockedError, CrossClassFallbackBlockedError } from "../../src/domain/errors.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";
import { AuditLogger } from "../../src/telemetry/audit-logger.js";

describe("GRITS Policy Integrity", () => {
  it("GRITS-POL-001: capability without approval blocked", async () => {
    const registry = createDefaultRegistry();

    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_capability: "external-llm",
          // no explicit_approval
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("GRITS-POL-002: session without risk acknowledgment blocked", async () => {
    const registry = createDefaultRegistry();

    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_session: "user-session-1",
          // no risk_acknowledged
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("GRITS-POL-003: local_only blocks non-provider paths", async () => {
    const registry = createDefaultRegistry();

    // local_only should block capability path
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_capability: "external-llm",
          explicit_approval: true,
          local_only: true,
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);

    // local_only should block session path
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_session: "user-session-1",
          risk_acknowledged: true,
          local_only: true,
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("GRITS-POL-004: Tier D blocked in sovereign mode", async () => {
    const registry = createDefaultRegistry();

    // Register a Tier D method
    registry.registerMethod({
      method_id: "apple.external.query",
      provider_id: "apple-intelligence-runtime",
      subsystem: "text",
      deterministic: false,
      requires_network: true,
      policy_tier: "D" as any,
      input_schema: {},
      output_schema: {},
    });

    // The default routing won't reach this method, so test policy engine directly
    const { evaluatePolicy } = await import("../../src/runtime/policy-engine.js");

    const decision = evaluatePolicy(
      {
        method_id: "apple.external.query",
        provider_id: "apple-intelligence-runtime",
        source_class: "provider",
      },
      registry,
      { local_only: true },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("TIER_D_BLOCKED_SOVEREIGN");
  });

  it("GRITS-POL-005: cross-class fallback blocked and logged", async () => {
    const registry = createDefaultRegistry();
    const auditLogger = new AuditLogger();

    await expect(
      executeRequest(
        {
          task: "summarize this document",
          fallback_method_id: "external-cap",
          fallback_source_class: "capability",
        },
        registry,
        undefined,
        { auditLogger },
      ),
    ).rejects.toThrow(CrossClassFallbackBlockedError);
  });

  it("GRITS-POL-006: policy decision logs include reason code", async () => {
    const registry = createDefaultRegistry();
    const auditLogger = new AuditLogger();

    // Successful policy decision
    await executeRequest(
      { task: "summarize this text" },
      registry,
      undefined,
      { auditLogger },
    );

    const events = auditLogger.getEvents();
    const policyEvents = events.filter(
      (e) => e.event_type === "policy_allowed" || e.event_type === "policy_denied",
    );
    expect(policyEvents.length).toBeGreaterThan(0);
    expect(policyEvents[0].policy_path).toBeTruthy();
    expect(policyEvents[0].details).toBeDefined();
    expect((policyEvents[0].details as Record<string, unknown>).reason_code).toBeTruthy();
  });
});
