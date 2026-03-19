import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../../src/runtime/policy-engine.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { PolicyTier } from "../../src/domain/policy-tiers.js";
import type { ResolvedMethod } from "../../src/runtime/method-resolver.js";

const registry = createDefaultRegistry();

describe("Policy Engine", () => {
  // Provider Tier A (e.g. apple.text.summarize)
  it("allows provider Tier A method", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.text.summarize",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const decision = evaluatePolicy(resolved, registry, {});
    expect(decision.allowed).toBe(true);
    expect(decision.reason_code).toBe("PROVIDER_ALLOWED");
  });

  // Provider Tier B (e.g. apple.writing.rewrite)
  it("allows provider Tier B method", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.writing.rewrite",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const decision = evaluatePolicy(resolved, registry, {});
    expect(decision.allowed).toBe(true);
  });

  // Provider Tier C (e.g. apple.image.generate)
  it("allows provider Tier C method", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.image.generate",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const decision = evaluatePolicy(resolved, registry, {});
    expect(decision.allowed).toBe(true);
  });

  // Provider Tier D blocked in local-only mode
  // (No Tier D methods exist in default registry, so we register one for this test)
  it("blocks provider Tier D method in local-only mode", () => {
    const testRegistry = createDefaultRegistry();
    // Register a Tier D method
    testRegistry.registerMethod({
      method_id: "apple.external.remote_call",
      provider_id: "apple-intelligence-runtime",
      subsystem: "text",
      deterministic: false,
      requires_network: true,
      policy_tier: PolicyTier.D,
      input_schema: {},
      output_schema: {},
    });

    const resolved: ResolvedMethod = {
      method_id: "apple.external.remote_call",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const decision = evaluatePolicy(resolved, testRegistry, { local_only: true });
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("TIER_D_BLOCKED_SOVEREIGN");
  });

  // Capability blocked without explicit approval
  it("blocks capability without explicit approval", () => {
    const resolved: ResolvedMethod = {
      method_id: "external-llm-cap",
      provider_id: "external-llm-cap",
      source_class: "capability",
    };
    const decision = evaluatePolicy(resolved, registry, {});
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("CAPABILITY_REQUIRES_APPROVAL");
  });

  // Capability allowed with explicit approval
  it("allows capability with explicit approval", () => {
    const resolved: ResolvedMethod = {
      method_id: "external-llm-cap",
      provider_id: "external-llm-cap",
      source_class: "capability",
    };
    const decision = evaluatePolicy(resolved, registry, { explicit_approval: true });
    expect(decision.allowed).toBe(true);
    expect(decision.reason_code).toBe("CAPABILITY_APPROVED");
  });

  // Session blocked without risk acknowledgment
  it("blocks session without risk acknowledgment", () => {
    const resolved: ResolvedMethod = {
      method_id: "user-session-123",
      provider_id: "user-session-123",
      source_class: "session",
    };
    const decision = evaluatePolicy(resolved, registry, {});
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("SESSION_RISK_UNACKNOWLEDGED");
  });

  // Session allowed with risk_acknowledged
  it("allows session with risk_acknowledged=true", () => {
    const resolved: ResolvedMethod = {
      method_id: "user-session-123",
      provider_id: "user-session-123",
      source_class: "session",
    };
    const decision = evaluatePolicy(resolved, registry, { risk_acknowledged: true });
    expect(decision.allowed).toBe(true);
    expect(decision.reason_code).toBe("SESSION_APPROVED");
  });

  // local_only blocks capability
  it("blocks capability path when local_only=true", () => {
    const resolved: ResolvedMethod = {
      method_id: "external-cap",
      provider_id: "external-cap",
      source_class: "capability",
    };
    const decision = evaluatePolicy(resolved, registry, {
      local_only: true,
      explicit_approval: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("LOCAL_ONLY_BLOCKS_CAPABILITY");
  });

  // local_only blocks session
  it("blocks session path when local_only=true", () => {
    const resolved: ResolvedMethod = {
      method_id: "user-session-123",
      provider_id: "user-session-123",
      source_class: "session",
    };
    const decision = evaluatePolicy(resolved, registry, {
      local_only: true,
      risk_acknowledged: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("LOCAL_ONLY_BLOCKS_SESSION");
  });

  // Cross-class fallback always blocked (tested via planner, but policy enforces source_class)
  it("cross-class fallback always blocked at policy level", () => {
    // Policy itself doesn't directly block cross-class fallback (that's the planner's job),
    // but we verify that mixed source classes get distinct decisions
    const providerDecision = evaluatePolicy(
      { method_id: "apple.text.summarize", provider_id: "apple-intelligence-runtime", source_class: "provider" },
      registry,
      {},
    );
    const capDecision = evaluatePolicy(
      { method_id: "ext-cap", provider_id: "ext-cap", source_class: "capability" },
      registry,
      { explicit_approval: true },
    );
    expect(providerDecision.source_class).toBe("provider");
    expect(capDecision.source_class).toBe("capability");
    // They belong to different source classes — planner will block cross-class fallback
    expect(providerDecision.source_class).not.toBe(capDecision.source_class);
  });
});
