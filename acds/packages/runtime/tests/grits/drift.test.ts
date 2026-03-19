/**
 * GRITS Drift Tests
 * GRITS-DRIFT-001 through GRITS-DRIFT-005
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";
import type { ProviderRuntime } from "../../src/providers/provider-runtime.js";
import {
  detectRoutingDrift,
  detectLatencyDrift,
  detectFallbackDrift,
  detectCapabilityCreep,
  type RoutingBaseline,
  type LatencyBaseline,
  type FallbackBaseline,
  type CapabilityBaseline,
} from "../../src/grits/drift-signals.js";
import { validateSchema } from "../../src/grits/schema-validator.js";

function buildProviders(): Map<string, ProviderRuntime> {
  const bundle = createFakePlatformBundle();
  const adapter = new AppleRuntimeAdapter(bundle);
  const providers = new Map<string, ProviderRuntime>();
  providers.set(adapter.provider_id, adapter);
  return providers;
}

describe("GRITS Drift Tests", () => {
  it("GRITS-DRIFT-001: resolver drift — same fixture, same registry, same policy, same path", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    const baseline: RoutingBaseline = {
      task: "summarize this text",
      expected_method_id: "apple.text.summarize",
      expected_provider_id: "apple-intelligence-runtime",
    };

    // Run 50 times and verify no drift
    for (let i = 0; i < 50; i++) {
      const response = await executeRequest(
        { task: "summarize this text", input: { text: "Stable input" } },
        registry,
        providers,
      );

      const driftResult = detectRoutingDrift(
        baseline.task,
        response.metadata.method_id,
        response.metadata.provider_id,
        baseline,
      );

      expect(driftResult.passed).toBe(true);
      expect(driftResult.category).toBe("drift");
    }
  });

  it("GRITS-DRIFT-002: schema drift — method output structure valid", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    // Run summarization multiple times
    for (let i = 0; i < 10; i++) {
      const response = await executeRequest(
        { task: "summarize this text", input: { text: "Consistent test input for schema" } },
        registry,
        providers,
      );

      // Summarize returns a string, validate it's not an object with keys
      const result = validateSchema(
        response.output,
        { required_keys: [] }, // strings have no required keys
        `DRIFT-SCHEMA-${i}`,
      );
      expect(result.passed).toBe(true);
    }

    // Test a structured output (OCR)
    const ocrResponse = await executeRequest(
      { task: "ocr", input: { image_path: "/test/image.png" } },
      registry,
      providers,
    );

    const ocrResult = validateSchema(
      ocrResponse.output,
      {
        required_keys: ["text", "confidence", "regions"],
        type_checks: { text: "string", confidence: "number" },
      },
      "DRIFT-SCHEMA-OCR",
    );
    expect(ocrResult.passed).toBe(true);
  });

  it("GRITS-DRIFT-003: latency drift — alert when exceeding baseline", () => {
    const baseline: LatencyBaseline = {
      method_id: "apple.text.summarize",
      mean_ms: 10,
      stddev_ms: 5,
    };

    // Normal latency — should pass
    const normalResult = detectLatencyDrift(
      "apple.text.summarize",
      15,
      baseline,
    );
    expect(normalResult.passed).toBe(true);

    // At boundary — should still pass (mean + 3*stddev = 25)
    const boundaryResult = detectLatencyDrift(
      "apple.text.summarize",
      25,
      baseline,
    );
    expect(boundaryResult.passed).toBe(true);

    // Exceeding baseline — should fail
    const driftResult = detectLatencyDrift(
      "apple.text.summarize",
      50,
      baseline,
    );
    expect(driftResult.passed).toBe(false);
    expect(driftResult.category).toBe("drift");
    expect(driftResult.details).toContain("drift");
  });

  it("GRITS-DRIFT-004: fallback drift — alert on regular fallback use", () => {
    const baseline: FallbackBaseline = {
      method_id: "apple.text.summarize",
      fallback_count: 1,
      total_executions: 100,
    };

    // Low fallback — should pass
    const lowResult = detectFallbackDrift(
      "apple.text.summarize",
      2,
      100,
      baseline,
    );
    expect(lowResult.passed).toBe(true);

    // High fallback — should fail (30% vs 1% baseline + 10% threshold)
    const highResult = detectFallbackDrift(
      "apple.text.summarize",
      30,
      100,
      baseline,
    );
    expect(highResult.passed).toBe(false);
    expect(highResult.category).toBe("drift");
    expect(highResult.details).toContain("Fallback drift");
  });

  it("GRITS-DRIFT-005: capability creep — alert on previously-local tasks invoking capabilities", () => {
    const baseline: CapabilityBaseline = {
      task: "summarize this text",
      expected_source_class: "provider",
    };

    // Normal provider path — should pass
    const normalResult = detectCapabilityCreep(
      "summarize this text",
      "provider",
      baseline,
    );
    expect(normalResult.passed).toBe(true);

    // Capability creep — should fail
    const creepResult = detectCapabilityCreep(
      "summarize this text",
      "capability",
      baseline,
    );
    expect(creepResult.passed).toBe(false);
    expect(creepResult.severity).toBe("critical");
    expect(creepResult.details).toContain("Capability creep");

    // Session drift — also a source class mismatch
    const sessionResult = detectCapabilityCreep(
      "summarize this text",
      "session",
      baseline,
    );
    expect(sessionResult.passed).toBe(false);
  });
});
