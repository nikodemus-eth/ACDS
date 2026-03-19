import { describe, it, expect } from "vitest";
import { resolveIntent } from "../../src/runtime/intent-resolver.js";
import { MethodUnresolvedError } from "../../src/domain/errors.js";

describe("Intent Resolver", () => {
  it("resolves 'summarize this document' to summarization", () => {
    const result = resolveIntent({ task: "summarize this document" });
    expect(result.intent).toBe("summarization");
  });

  it("resolves 'transcribe this audio file' to transcription", () => {
    const result = resolveIntent({ task: "transcribe this audio file" });
    expect(result.intent).toBe("transcription");
  });

  it("resolves 'read this report aloud' to speech_output", () => {
    const result = resolveIntent({ task: "read this report aloud" });
    expect(result.intent).toBe("speech_output");
  });

  it("resolves 'extract text from this screenshot' to ocr", () => {
    const result = resolveIntent({ task: "extract text from this screenshot" });
    expect(result.intent).toBe("ocr");
  });

  it("resolves 'translate this text' to translation", () => {
    const result = resolveIntent({ task: "translate this text" });
    expect(result.intent).toBe("translation");
  });

  it("resolves 'generate an image' to image_generation", () => {
    const result = resolveIntent({ task: "generate an image" });
    expect(result.intent).toBe("image_generation");
  });

  it("resolves 'classify these sounds' to sound_classification", () => {
    const result = resolveIntent({ task: "classify these sounds" });
    expect(result.intent).toBe("sound_classification");
  });

  it("throws MethodUnresolvedError for unknown task", () => {
    expect(() => resolveIntent({ task: "do something unknown and random" })).toThrow(
      MethodUnresolvedError,
    );
  });

  it("preserves source_override for explicit capability override", () => {
    const result = resolveIntent({
      task: "summarize this document",
      use_capability: "external-llm-cap",
    });
    expect(result.intent).toBe("summarization");
    expect(result.source_override).toEqual({
      type: "capability",
      id: "external-llm-cap",
    });
  });

  it("preserves source_override with risk_acknowledged for session override", () => {
    const result = resolveIntent({
      task: "summarize this document",
      use_session: "user-session-123",
      risk_acknowledged: true,
    });
    expect(result.intent).toBe("summarization");
    expect(result.source_override).toEqual({
      type: "session",
      id: "user-session-123",
      risk_acknowledged: true,
    });
  });
});
