/**
 * GRITS Routing Integrity Tests
 * GRITS-ROUTE-001 through GRITS-ROUTE-006
 */
import { describe, it, expect } from "vitest";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";
import { createDefaultRegistry } from "../../src/registry/default-registry.js";
import { MethodUnresolvedError } from "../../src/domain/errors.js";

const registry = createDefaultRegistry();

describe("GRITS Routing Integrity", () => {
  it("GRITS-ROUTE-001: 'summarize this text' routes to Apple summarize", async () => {
    const response = await executeRequest(
      { task: "summarize this text" },
      registry,
    );
    expect(response.metadata.method_id).toBe("apple.text.summarize");
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
  });

  it("GRITS-ROUTE-002: 'transcribe this audio' routes to speech transcription", async () => {
    const response = await executeRequest(
      { task: "transcribe this audio" },
      registry,
    );
    expect(response.metadata.method_id).toBe("apple.speech_in.transcribe_file");
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
  });

  it("GRITS-ROUTE-003: 'read this aloud' routes to TTS", async () => {
    const response = await executeRequest(
      { task: "read this aloud" },
      registry,
    );
    expect(response.metadata.method_id).toBe("apple.speech_out.render_audio");
    expect(response.metadata.provider_id).toBe("apple-intelligence-runtime");
  });

  it("GRITS-ROUTE-004: explicit capability override routes correctly", async () => {
    const response = await executeRequest(
      {
        task: "summarize this document",
        use_capability: "external-llm",
        explicit_approval: true,
      },
      registry,
    );
    expect(response.metadata.provider_id).toBe("external-llm");
    expect(response.metadata.execution_mode).toBe("controlled_remote");
  });

  it("GRITS-ROUTE-005: unknown intent fails cleanly", async () => {
    await expect(
      executeRequest({ task: "do something completely unknown xyz123" }, registry),
    ).rejects.toThrow(MethodUnresolvedError);
  });

  it("GRITS-ROUTE-006: determinism — same input resolves identically across 100 runs", async () => {
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      const response = await executeRequest(
        { task: "summarize this text" },
        registry,
      );
      results.push(response.metadata.method_id);
    }

    const unique = new Set(results);
    expect(unique.size).toBe(1);
    expect(results[0]).toBe("apple.text.summarize");
  });
});
