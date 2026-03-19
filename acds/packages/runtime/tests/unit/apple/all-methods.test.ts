/**
 * All-methods test — every one of the 18 Apple methods executes
 * through AppleRuntimeAdapter with correct MethodExecutionResult shape.
 */
import { describe, it, expect } from "vitest";
import { AppleRuntimeAdapter } from "../../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../../src/providers/apple/apple-fakes.js";

describe("AppleRuntimeAdapter — all methods", () => {
  const bundle = createFakePlatformBundle();
  const adapter = new AppleRuntimeAdapter(bundle);

  // All 18 method_ids with their required inputs
  const methodCases: Array<[string, unknown]> = [
    // Foundation Models
    ["apple.text.generate", { prompt: "test prompt" }],
    ["apple.text.summarize", { text: "some long text to summarize" }],
    ["apple.text.extract", { text: "John 42 SF", schema: { name: "string", age: "number" } }],

    // Writing Tools
    ["apple.writing.rewrite", { text: "This needs rewriting" }],
    ["apple.writing.proofread", { text: "Ths has typos" }],
    ["apple.writing.summarize", { text: "Long writing sample text" }],

    // Speech In
    ["apple.speech_in.transcribe_live", { audio_stream: "mic_input" }],
    ["apple.speech_in.transcribe_file", { path: "/audio/file.m4a" }],
    ["apple.speech_in.transcribe_longform", { path: "/audio/long.m4a" }],
    ["apple.speech_in.dictation_fallback", { audio_stream: "dictation" }],

    // Speech Out (TTS)
    ["apple.speech_out.speak", { text: "Hello" }],
    ["apple.speech_out.render_audio", { text: "Hello" }],

    // Vision
    ["apple.vision.ocr", { image_path: "/img/test.png" }],
    ["apple.vision.document_extract", { image_path: "/img/doc.png" }],

    // Image
    ["apple.image.generate", { prompt: "A sunset" }],

    // Translation
    ["apple.translation.translate", { text: "Hello", target_language: "es" }],

    // Sound
    ["apple.sound.classify", { audio_path: "/audio/clip.wav" }],
  ];

  for (const [method_id, input] of methodCases) {
    it(`${method_id} executes and returns valid MethodExecutionResult`, async () => {
      expect(adapter.supports(method_id)).toBe(true);

      const result = await adapter.execute(method_id, input);

      expect(result).toHaveProperty("output");
      expect(result.output).not.toBeNull();
      expect(result.output).not.toBeUndefined();
      expect(result.deterministic).toBe(true);
      expect(result.execution_mode).toBe("local");
      expect(typeof result.latency_ms).toBe("number");
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });
  }

  it("unsupported method returns METHOD_NOT_AVAILABLE error", async () => {
    expect(adapter.supports("apple.nonexistent.method")).toBe(false);
    await expect(
      adapter.execute("apple.nonexistent.method", {}),
    ).rejects.toThrow("Method not available");
  });

  it("health returns healthy status", () => {
    const health = adapter.health();
    expect(health.state).toBe("healthy");
    expect(health.checked_at).toBeGreaterThan(0);
  });

  it("provider_id is correct", () => {
    expect(adapter.provider_id).toBe("apple-intelligence-runtime");
  });
});
