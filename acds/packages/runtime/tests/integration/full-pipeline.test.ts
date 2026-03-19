import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { PolicyBlockedError, CrossClassFallbackBlockedError } from "../../src/domain/errors.js";

const registry = createDefaultRegistry();

describe("Full Pipeline Integration", () => {
  it("runs full provider summarization path", async () => {
    const response = await executeRequest({ task: "summarize this document" }, registry);
    expect(response.output).toBe("placeholder");
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
    expect(response.metadata.method_id).toBe("apple.text.summarize");
    expect(response.metadata.execution_mode).toBe("local");
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.validated).toBe(true);
  });

  it("runs full TTS path", async () => {
    const response = await executeRequest({ task: "read this report aloud" }, registry);
    expect(response.metadata.method_id).toBe("apple.speech_out.render_audio");
    expect(response.metadata.execution_mode).toBe("local");
  });

  it("runs full OCR path", async () => {
    const response = await executeRequest({ task: "extract text from this screenshot" }, registry);
    expect(response.metadata.method_id).toBe("apple.vision.ocr");
    expect(response.metadata.execution_mode).toBe("local");
  });

  it("runs capability override path with explicit approval", async () => {
    const response = await executeRequest(
      {
        task: "summarize this document",
        use_capability: "external-llm-cap",
        explicit_approval: true,
      },
      registry,
    );
    expect(response.metadata.provider_id).toBe("external-llm-cap");
    expect(response.metadata.execution_mode).toBe("controlled_remote");
    expect(response.metadata.deterministic).toBe(false);
  });

  it("returns structured error when policy denies request", async () => {
    await expect(
      executeRequest(
        {
          task: "summarize this document",
          use_capability: "external-llm-cap",
          // no explicit_approval
        },
        registry,
      ),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("blocks cross-class fallback end-to-end", async () => {
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
});
