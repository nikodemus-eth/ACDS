/**
 * GRITS Observability Integrity Tests
 * GRITS-OBS-001 through GRITS-OBS-006
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";
import type { ProviderRuntime } from "../../src/providers/provider-runtime.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";
import { AuditLogger } from "../../src/telemetry/audit-logger.js";
import { GritsHooks } from "../../src/grits/grits-hooks.js";

function buildProviders(): Map<string, ProviderRuntime> {
  const bundle = createFakePlatformBundle();
  const adapter = new AppleRuntimeAdapter(bundle);
  const providers = new Map<string, ProviderRuntime>();
  providers.set(adapter.provider_id, adapter);
  return providers;
}

describe("GRITS Observability Integrity", () => {
  it("GRITS-OBS-001: every execution emits structured log", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();
    const executionLogger = new ExecutionLogger();

    await executeRequest(
      { task: "summarize this text", input: { text: "Hello world" } },
      registry,
      providers,
      { executionLogger },
    );

    const events = executionLogger.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(3); // started, policy, succeeded
  });

  it("GRITS-OBS-002: all required fields present on events", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();
    const executionLogger = new ExecutionLogger();

    await executeRequest(
      { task: "summarize this text", input: { text: "Test content" } },
      registry,
      providers,
      { executionLogger },
    );

    const events = executionLogger.getEvents();
    for (const event of events) {
      expect(event.event_id).toBeTruthy();
      expect(event.event_type).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
      expect(event.execution_id).toBeTruthy();
      expect(event.source_type).toBeTruthy();
      expect(event.source_id).toBeTruthy();
      expect(event.status).toBeTruthy();
    }

    // Check the succeeded event specifically for method_id and latency
    const succeededEvents = events.filter(
      (e) => e.event_type === "execution_succeeded",
    );
    expect(succeededEvents.length).toBe(1);
    expect(succeededEvents[0].method_id).toBeTruthy();
    expect(typeof succeededEvents[0].latency_ms).toBe("number");
  });

  it("GRITS-OBS-003: policy decisions emit separate audit events", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();
    const auditLogger = new AuditLogger();

    await executeRequest(
      { task: "summarize this text", input: { text: "Audit test" } },
      registry,
      providers,
      { auditLogger },
    );

    const events = auditLogger.getEvents();
    const policyEvents = events.filter(
      (e) => e.event_type === "policy_allowed" || e.event_type === "policy_denied",
    );
    expect(policyEvents.length).toBeGreaterThan(0);
    expect(policyEvents[0].policy_path).toBeTruthy();
  });

  it("GRITS-OBS-004: fallback events emit separate audit events", async () => {
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
      { auditLogger },
    );

    const events = auditLogger.getEvents();
    const fallbackEvents = events.filter(
      (e) => e.event_type === "fallback_triggered",
    );
    expect(fallbackEvents.length).toBe(1);
  });

  it("GRITS-OBS-005: secrets redacted from logs", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();
    const executionLogger = new ExecutionLogger();

    await executeRequest(
      {
        task: "summarize this text",
        input: {
          text: "Sensitive data",
          token: "abcdefghijklmnopqrstuvwxyz1234567890",
          authorization: "Bearer sk-abcdefghijklmnopqrstuvwxyz1234567890",
        },
      },
      registry,
      providers,
      { executionLogger },
    );

    const events = executionLogger.getEvents();
    const serialized = JSON.stringify(events);

    // The token and bearer values should not appear in logs
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    expect(serialized).not.toContain("Bearer sk-");
  });

  it("GRITS-OBS-006: validation results attached to response", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();
    const gritsHooks = new GritsHooks();

    const response = await executeRequest(
      { task: "summarize this text", input: { text: "Validate me" } },
      registry,
      providers,
      { gritsHooks },
    );

    // The response should have metadata.validated
    expect(response.metadata.validated).toBe(true);
    // Warnings array may or may not be present depending on validation results
    // but the response should be well-formed
    expect(response.metadata).toBeDefined();
  });
});
