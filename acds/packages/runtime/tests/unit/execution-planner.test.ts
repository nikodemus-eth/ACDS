import { describe, it, expect } from "vitest";
import { buildExecutionPlan } from "../../src/runtime/execution-planner.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { CrossClassFallbackBlockedError } from "../../src/domain/errors.js";
import type { ResolvedMethod } from "../../src/runtime/method-resolver.js";
import type { PolicyDecision } from "../../src/runtime/policy-engine.js";

const registry = createDefaultRegistry();

function providerDecision(): PolicyDecision {
  return {
    allowed: true,
    reason_code: "PROVIDER_ALLOWED",
    details: "allowed",
    source_class: "provider",
  };
}

function capabilityDecision(): PolicyDecision {
  return {
    allowed: true,
    reason_code: "CAPABILITY_APPROVED",
    details: "allowed",
    source_class: "capability",
  };
}

describe("Execution Planner", () => {
  it("produces local primary plan for Apple method", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.text.summarize",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const plan = buildExecutionPlan(resolved, providerDecision(), registry);
    expect(plan.primary.provider_id).toBe("apple-intelligence-runtime");
    expect(plan.primary.method_id).toBe("apple.text.summarize");
    expect(plan.primary.execution_mode).toBe("local");
  });

  it("includes same-class fallback when available", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.text.summarize",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const plan = buildExecutionPlan(resolved, providerDecision(), registry, {
      fallback_method_id: "apple.text.generate",
      fallback_source_class: "provider",
    });
    expect(plan.fallback).toBeDefined();
    expect(plan.fallback!.method_id).toBe("apple.text.generate");
    expect(plan.fallback!.provider_id).toBe("apple-intelligence-runtime");
  });

  it("rejects cross-class fallback", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.text.summarize",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    expect(() =>
      buildExecutionPlan(resolved, providerDecision(), registry, {
        fallback_method_id: "external-cap",
        fallback_source_class: "capability",
      }),
    ).toThrow(CrossClassFallbackBlockedError);
  });

  it("produces isolated capability plan with no provider fallback", () => {
    const resolved: ResolvedMethod = {
      method_id: "external-llm-cap",
      provider_id: "external-llm-cap",
      source_class: "capability",
    };
    const plan = buildExecutionPlan(resolved, capabilityDecision(), registry);
    expect(plan.primary.execution_mode).toBe("controlled_remote");
    expect(plan.fallback).toBeUndefined();
  });

  it("includes correct execution_mode in plan", () => {
    const resolved: ResolvedMethod = {
      method_id: "apple.vision.ocr",
      provider_id: "apple-intelligence-runtime",
      source_class: "provider",
    };
    const plan = buildExecutionPlan(resolved, providerDecision(), registry);
    expect(plan.primary.execution_mode).toBe("local");
    expect(plan.constraints.local_only).toBe(false);
  });
});
