import { describe, it, expect } from "vitest";
import { resolveMethod } from "../../src/runtime/method-resolver.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { MethodUnresolvedError } from "../../src/domain/errors.js";
import type { ResolvedIntent } from "../../src/runtime/intent-resolver.js";

const registry = createDefaultRegistry();

describe("Method Resolver", () => {
  const intentCases: [string, string, string][] = [
    ["summarization", "apple.text.summarize", "apple-intelligence-runtime"],
    ["transcription", "apple.speech_in.transcribe_file", "apple-intelligence-runtime"],
    ["speech_output", "apple.speech_out.render_audio", "apple-intelligence-runtime"],
    ["ocr", "apple.vision.ocr", "apple-intelligence-runtime"],
    ["translation", "apple.translation.translate", "apple-intelligence-runtime"],
    ["image_generation", "apple.image.generate", "apple-intelligence-runtime"],
    ["sound_classification", "apple.sound.classify", "apple-intelligence-runtime"],
    ["text_generation", "apple.text.generate", "apple-intelligence-runtime"],
    ["proofreading", "apple.writing.proofread", "apple-intelligence-runtime"],
    ["rewriting", "apple.writing.rewrite", "apple-intelligence-runtime"],
  ];

  for (const [intent, expectedMethod, expectedProvider] of intentCases) {
    it(`maps '${intent}' to ${expectedMethod}`, () => {
      const resolved = resolveMethod({ intent }, registry);
      expect(resolved.method_id).toBe(expectedMethod);
      expect(resolved.provider_id).toBe(expectedProvider);
      expect(resolved.source_class).toBe("provider");
    });
  }

  it("throws MethodUnresolvedError for unknown intent", () => {
    expect(() =>
      resolveMethod({ intent: "totally_unknown_intent" }, registry),
    ).toThrow(MethodUnresolvedError);
  });

  it("routes capability override to capability path with source_class='capability'", () => {
    const intent: ResolvedIntent = {
      intent: "summarization",
      source_override: { type: "capability", id: "external-llm-cap" },
    };
    const resolved = resolveMethod(intent, registry);
    expect(resolved.source_class).toBe("capability");
    expect(resolved.method_id).toBe("external-llm-cap");
    expect(resolved.provider_id).toBe("external-llm-cap");
  });

  it("returns correct provider_id for each method", () => {
    for (const [intent, , expectedProvider] of intentCases) {
      const resolved = resolveMethod({ intent }, registry);
      expect(resolved.provider_id).toBe(expectedProvider);
    }
  });
});
