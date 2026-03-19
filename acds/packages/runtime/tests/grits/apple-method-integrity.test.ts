/**
 * GRITS Apple Method Integrity Tests
 * GRITS-APPLE-* tests
 */
import { describe, it, expect } from "vitest";
import { AppleRuntimeAdapter } from "../../src/providers/apple/apple-runtime-adapter.js";
import { createFakePlatformBundle } from "../../src/providers/apple/apple-fakes.js";

function createAdapter(): AppleRuntimeAdapter {
  return new AppleRuntimeAdapter(createFakePlatformBundle());
}

describe("GRITS Apple Method Integrity", () => {
  it("GRITS-APPLE-001: summarize output conforms to text schema", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.text.summarize", {
      text: "Machine learning is a subset of artificial intelligence focused on algorithms.",
    });

    expect(typeof result.output).toBe("string");
    expect((result.output as string).length).toBeGreaterThan(0);
    expect(result.deterministic).toBe(true);
    expect(result.execution_mode).toBe("local");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("GRITS-APPLE-002: structured extraction returns required keys", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.text.extract", {
      text: "John Smith works at Acme Corp in New York",
      schema: { name: "string", company: "string", location: "string" },
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output).toBe("object");
    expect(output).toHaveProperty("name");
    expect(output).toHaveProperty("company");
    expect(output).toHaveProperty("location");
  });

  it("GRITS-APPLE-003: repeated summarization within allowed variance", async () => {
    const adapter = createAdapter();
    const input = { text: "The quick brown fox jumps over the lazy dog." };

    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await adapter.execute("apple.text.summarize", input);
      results.push(result.output as string);
    }

    // All results should be identical (deterministic fake)
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it("GRITS-APPLE-004: speech transcription returns transcript and timing", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.speech_in.transcribe_file", {
      path: "/audio/meeting.m4a",
    });

    const output = result.output as { text: string; confidence: number; segments: unknown[] };
    expect(typeof output.text).toBe("string");
    expect(output.text.length).toBeGreaterThan(0);
    expect(typeof output.confidence).toBe("number");
    expect(output.confidence).toBeGreaterThan(0);
    expect(Array.isArray(output.segments)).toBe(true);
    expect(output.segments.length).toBeGreaterThan(0);

    // Check segment structure
    const segment = output.segments[0] as { text: string; start_ms: number; end_ms: number };
    expect(typeof segment.text).toBe("string");
    expect(typeof segment.start_ms).toBe("number");
    expect(typeof segment.end_ms).toBe("number");
  });

  it("GRITS-APPLE-005: TTS returns audio artifact reference", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.speech_out.render_audio", {
      text: "Welcome to the runtime",
    });

    const output = result.output as { artifact_path: string; format: string; duration_ms: number };
    expect(typeof output.artifact_path).toBe("string");
    expect(output.artifact_path).toContain("/tmp/tts/");
    expect(typeof output.format).toBe("string");
    expect(typeof output.duration_ms).toBe("number");
    expect(output.duration_ms).toBeGreaterThan(0);
  });

  it("GRITS-APPLE-006: OCR returns extracted text", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.vision.ocr", {
      image_path: "/images/document.png",
    });

    const output = result.output as { text: string; confidence: number; regions: unknown[] };
    expect(typeof output.text).toBe("string");
    expect(output.text.length).toBeGreaterThan(0);
    expect(typeof output.confidence).toBe("number");
    expect(Array.isArray(output.regions)).toBe(true);
  });

  it("GRITS-APPLE-007: image generation returns image artifact", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.image.generate", {
      prompt: "A sunset over mountains",
    });

    const output = result.output as { artifact_path: string; width: number; height: number };
    expect(typeof output.artifact_path).toBe("string");
    expect(output.artifact_path).toContain("/tmp/image/");
    expect(typeof output.width).toBe("number");
    expect(typeof output.height).toBe("number");
  });

  it("GRITS-APPLE-008: translation returns translated text and detected language", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.translation.translate", {
      text: "Good morning",
      target_language: "es",
    });

    const output = result.output as { translated: string; source_language: string; target_language: string };
    expect(typeof output.translated).toBe("string");
    expect(output.translated).toContain("Good morning");
    expect(typeof output.source_language).toBe("string");
    expect(output.source_language).toBe("en");
    expect(typeof output.target_language).toBe("string");
    expect(output.target_language).toBe("es");
  });

  it("GRITS-APPLE-009: sound classification returns event labels", async () => {
    const adapter = createAdapter();
    const result = await adapter.execute("apple.sound.classify", {
      audio_path: "/audio/sample.wav",
    });

    const output = result.output as { events: Array<{ label: string; confidence: number }> };
    expect(Array.isArray(output.events)).toBe(true);
    expect(output.events.length).toBeGreaterThan(0);
    expect(typeof output.events[0].label).toBe("string");
    expect(typeof output.events[0].confidence).toBe("number");
  });
});
