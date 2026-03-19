/**
 * Integration tests — end-to-end through orchestrator with real Apple adapter.
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import type { ProviderRuntime } from "../../src/providers/provider-runtime.js";

function buildProviders(): Map<string, ProviderRuntime> {
  const bundle = createFakePlatformBundle();
  const adapter = new AppleRuntimeAdapter(bundle);
  const providers = new Map<string, ProviderRuntime>();
  providers.set(adapter.provider_id, adapter);
  return providers;
}

describe("Apple pipeline integration", () => {
  it("summarize text → full pipeline → structured response", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    const response = await executeRequest(
      {
        task: "summarization",
        input: { text: "A comprehensive analysis of machine learning models and their applications in healthcare, finance, and autonomous vehicles." },
      },
      registry,
      providers,
    );

    expect(response.output).toContain("Summary:");
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
    expect(response.metadata.method_id).toBe("apple.text.summarize");
    expect(response.metadata.execution_mode).toBe("local");
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.validated).toBe(true);
    expect(response.metadata.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("TTS render → full pipeline → audio artifact reference", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    const response = await executeRequest(
      {
        task: "read this report aloud",
        input: { text: "Welcome to the ACDS runtime" },
      },
      registry,
      providers,
    );

    const artifact = response.output as { artifact_path: string; format: string; duration_ms: number };
    expect(artifact.artifact_path).toContain("/tmp/tts/");
    expect(artifact.format).toBe("aiff");
    expect(artifact.duration_ms).toBeGreaterThan(0);
    expect(response.metadata.method_id).toBe("apple.speech_out.render_audio");
  });

  it("OCR → full pipeline → extracted text", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    const response = await executeRequest(
      {
        task: "ocr",
        input: { image_path: "/photos/whiteboard.jpg" },
      },
      registry,
      providers,
    );

    const ocr = response.output as { text: string; confidence: number };
    expect(ocr.text).toContain("OCR result from /photos/whiteboard.jpg");
    expect(ocr.confidence).toBe(0.92);
    expect(response.metadata.method_id).toBe("apple.vision.ocr");
  });

  it("Translation → full pipeline → translated text", async () => {
    const registry = createDefaultRegistry();
    const providers = buildProviders();

    const response = await executeRequest(
      {
        task: "translation",
        input: { text: "Good morning", target_language: "fr" },
      },
      registry,
      providers,
    );

    const translation = response.output as { translated: string; source_language: string; target_language: string };
    expect(translation.translated).toBe("[fr] Good morning");
    expect(translation.source_language).toBe("en");
    expect(translation.target_language).toBe("fr");
    expect(response.metadata.method_id).toBe("apple.translation.translate");
  });

  it("same-class fallback path works when primary is unavailable", async () => {
    const registry = createDefaultRegistry();
    const bundle = createFakePlatformBundle();
    const appleAdapter = new AppleRuntimeAdapter(bundle);

    // Mark apple adapter as unavailable
    appleAdapter.setHealth("unavailable", "Simulated failure");

    // Create a simple fallback provider that handles text.generate
    const fallbackProvider: ProviderRuntime = {
      provider_id: "ollama-local",
      health: () => ({ state: "healthy" as const, checked_at: Date.now() }),
      supports: (id: string) => id === "apple.text.generate",
      execute: async (_id: string, input: unknown) => {
        const data = input as Record<string, unknown>;
        return {
          output: `Ollama fallback: ${data?.prompt ?? "no prompt"}`,
          latency_ms: 5,
          deterministic: true,
          execution_mode: "local" as const,
        };
      },
    };

    const providers = new Map<string, ProviderRuntime>();
    providers.set(appleAdapter.provider_id, appleAdapter);
    providers.set(fallbackProvider.provider_id, fallbackProvider);

    // Register a fallback method for ollama
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
        input: { prompt: "Hello from fallback" },
        fallback_method_id: "ollama.text.generate",
        fallback_source_class: "provider",
      },
      registry,
      providers,
    );

    expect(response.output).toContain("Ollama fallback");
    expect(response.metadata.provider_id).toBe("ollama-local");
  });
});
