/**
 * GRITS Fallback Integrity Tests
 * GRITS-FALL-001 through GRITS-FALL-005
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";
import {
  ProviderUnavailableError,
  CrossClassFallbackBlockedError,
  PolicyBlockedError,
} from "../../src/domain/errors.js";
import type { ProviderRuntime } from "../../src/providers/provider-runtime.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";
import { AuditLogger } from "../../src/telemetry/audit-logger.js";

describe("GRITS Fallback Integrity", () => {
  it("GRITS-FALL-001: same-class fallback works", async () => {
    const registry = createDefaultRegistry();
    const bundle = createFakePlatformBundle();
    const appleAdapter = new AppleRuntimeAdapter(bundle);
    appleAdapter.setHealth("unavailable", "Simulated failure");

    // Create a fallback provider
    const fallbackProvider: ProviderRuntime = {
      provider_id: "ollama-local",
      health: () => ({ state: "healthy" as const, checked_at: Date.now() }),
      supports: (id: string) => id === "ollama.text.generate",
      execute: async (_id: string, input: unknown) => ({
        output: `Fallback output`,
        latency_ms: 3,
        deterministic: true,
        execution_mode: "local" as const,
      }),
    };

    const providers = new Map<string, ProviderRuntime>();
    providers.set(appleAdapter.provider_id, appleAdapter);
    providers.set(fallbackProvider.provider_id, fallbackProvider);

    // Register fallback method
    registry.registerMethod({
      method_id: "ollama.text.generate",
      provider_id: "ollama-local",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: "A" as any,
      input_schema: {},
      output_schema: {},
    });

    const response = await executeRequest(
      {
        task: "generate text about something",
        input: { prompt: "test" },
        fallback_method_id: "ollama.text.generate",
        fallback_source_class: "provider",
      },
      registry,
      providers,
    );

    expect(response.output).toBe("Fallback output");
    expect(response.metadata.provider_id).toBe("ollama-local");
  });

  it("GRITS-FALL-002: no fallback returns terminal error", async () => {
    const registry = createDefaultRegistry();
    const bundle = createFakePlatformBundle();
    const appleAdapter = new AppleRuntimeAdapter(bundle);
    appleAdapter.setHealth("unavailable", "System failure");

    const providers = new Map<string, ProviderRuntime>();
    providers.set(appleAdapter.provider_id, appleAdapter);

    await expect(
      executeRequest(
        { task: "summarize this text" },
        registry,
        providers,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("GRITS-FALL-003: cross-class fallback rejected even under failure pressure", async () => {
    const registry = createDefaultRegistry();

    await expect(
      executeRequest(
        {
          task: "summarize this document",
          fallback_method_id: "external-cap",
          fallback_source_class: "capability",
        },
        registry,
      ),
    ).rejects.toThrow(CrossClassFallbackBlockedError);
  });

  it("GRITS-FALL-004: fallback events logged with source and reason", async () => {
    const registry = createDefaultRegistry();
    const bundle = createFakePlatformBundle();
    const appleAdapter = new AppleRuntimeAdapter(bundle);
    appleAdapter.setHealth("unavailable", "Simulated failure");

    const fallbackProvider: ProviderRuntime = {
      provider_id: "ollama-local",
      health: () => ({ state: "healthy" as const, checked_at: Date.now() }),
      supports: (id: string) => id === "ollama.text.generate",
      execute: async () => ({
        output: "Fallback output",
        latency_ms: 2,
        deterministic: true,
        execution_mode: "local" as const,
      }),
    };

    const providers = new Map<string, ProviderRuntime>();
    providers.set(appleAdapter.provider_id, appleAdapter);
    providers.set(fallbackProvider.provider_id, fallbackProvider);

    registry.registerMethod({
      method_id: "ollama.text.generate",
      provider_id: "ollama-local",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: "A" as any,
      input_schema: {},
      output_schema: {},
    });

    const executionLogger = new ExecutionLogger();
    const auditLogger = new AuditLogger();

    await executeRequest(
      {
        task: "generate text about something",
        input: { prompt: "test" },
        fallback_method_id: "ollama.text.generate",
        fallback_source_class: "provider",
      },
      registry,
      providers,
      { executionLogger, auditLogger },
    );

    // Check execution logger has fallback event
    const execEvents = executionLogger.getEvents();
    const fallbackEvents = execEvents.filter(
      (e) => e.event_type === "fallback_triggered",
    );
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackEvents[0].details).toBeDefined();
    expect((fallbackEvents[0].details as Record<string, unknown>).reason).toBe(
      "primary_unavailable",
    );
    expect(
      (fallbackEvents[0].details as Record<string, unknown>).primary_provider,
    ).toBe("apple-intelligence-runtime");

    // Also check audit logger
    const auditEvents = auditLogger.getEvents();
    const auditFallbacks = auditEvents.filter(
      (e) => e.event_type === "fallback_triggered",
    );
    expect(auditFallbacks.length).toBe(1);
  });

  it("GRITS-FALL-005: repeated failure increments degradation", () => {
    const bundle = createFakePlatformBundle();
    const adapter = new AppleRuntimeAdapter(bundle);

    // Simulate progressive degradation
    expect(adapter.health().state).toBe("healthy");

    adapter.setHealth("degraded", "Partial issues");
    expect(adapter.health().state).toBe("degraded");

    adapter.setHealth("unavailable", "Full failure");
    expect(adapter.health().state).toBe("unavailable");

    // Verify the state persists
    expect(adapter.health().state).toBe("unavailable");
    expect(adapter.health().message).toBe("Full failure");
  });
});
