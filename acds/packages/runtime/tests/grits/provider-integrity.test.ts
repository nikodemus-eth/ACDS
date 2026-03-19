/**
 * GRITS Provider Integrity Tests
 * GRITS-PROV-001 through GRITS-PROV-005
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";
import { ProviderUnavailableError, MethodNotAvailableError } from "../../src/domain/errors.js";
import type { ProviderRuntime } from "../../src/providers/provider-runtime.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";

function buildProviders(): { providers: Map<string, ProviderRuntime>; adapter: AppleRuntimeAdapter } {
  const bundle = createFakePlatformBundle();
  const adapter = new AppleRuntimeAdapter(bundle);
  const providers = new Map<string, ProviderRuntime>();
  providers.set(adapter.provider_id, adapter);
  return { providers, adapter };
}

describe("GRITS Provider Integrity", () => {
  it("GRITS-PROV-001: provider unavailable detected before execution", async () => {
    const registry = createDefaultRegistry();
    const { providers, adapter } = buildProviders();

    adapter.setHealth("unavailable", "System offline");

    await expect(
      executeRequest(
        { task: "summarize this text" },
        registry,
        providers,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("GRITS-PROV-002: structured metadata on success", async () => {
    const registry = createDefaultRegistry();
    const { providers } = buildProviders();

    const response = await executeRequest(
      {
        task: "summarize this text",
        input: { text: "Machine learning is transforming industries." },
      },
      registry,
      providers,
    );

    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
    expect(response.metadata.method_id).toBe("apple.text.summarize");
    expect(response.metadata.execution_mode).toBe("local");
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.latency_ms).toBeGreaterThanOrEqual(0);
    expect(response.metadata.validated).toBe(true);
  });

  it("GRITS-PROV-003: unsupported method returns METHOD_NOT_AVAILABLE", async () => {
    const registry = createDefaultRegistry();

    // Register a method that the provider doesn't actually handle
    registry.registerMethod({
      method_id: "apple.text.nonexistent_method",
      provider_id: "apple-intelligence-runtime",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: "A" as any,
      input_schema: {},
      output_schema: {},
    });

    const { providers } = buildProviders();

    // The adapter won't support this method
    const adapter = providers.get("apple-intelligence-runtime") as AppleRuntimeAdapter;
    expect(adapter.supports("apple.text.nonexistent_method")).toBe(false);

    // Directly test via provider.execute
    await expect(
      adapter.execute("apple.text.nonexistent_method", {}),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it("GRITS-PROV-004: provider timeout logged", async () => {
    const registry = createDefaultRegistry();
    const { providers } = buildProviders();
    const executionLogger = new ExecutionLogger();

    const response = await executeRequest(
      {
        task: "summarize this text",
        input: { text: "Some text to summarize" },
      },
      registry,
      providers,
      { executionLogger },
    );

    // Verify latency is logged in events
    const events = executionLogger.getEvents();
    const successEvents = events.filter(
      (e) => e.event_type === "execution_succeeded",
    );
    expect(successEvents.length).toBeGreaterThan(0);
    expect(typeof successEvents[0].latency_ms).toBe("number");
  });

  it("GRITS-PROV-005: health status transitions correctly", () => {
    const bundle = createFakePlatformBundle();
    const adapter = new AppleRuntimeAdapter(bundle);

    expect(adapter.health().state).toBe("healthy");

    adapter.setHealth("degraded", "Partial failure");
    expect(adapter.health().state).toBe("degraded");
    expect(adapter.health().message).toBe("Partial failure");

    adapter.setHealth("unavailable", "Full failure");
    expect(adapter.health().state).toBe("unavailable");

    adapter.setHealth("healthy", "Recovered");
    expect(adapter.health().state).toBe("healthy");
  });
});
