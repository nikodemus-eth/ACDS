/**
 * TTS handler tests.
 */
import { describe, it, expect } from "vitest";
import { FakeTts } from "../../../src/providers/apple/apple-fakes.js";
import { handleTts } from "../../../src/providers/apple/methods/tts.js";

describe("TTS handler", () => {
  const platform = new FakeTts();

  it("speak succeeds", async () => {
    const result = await handleTts(
      "apple.speech_out.speak",
      { text: "Hello world" },
      platform,
    );
    expect(result).toEqual({ spoken: true });
  });

  it("render_audio returns artifact reference with format and duration", async () => {
    const result = await handleTts(
      "apple.speech_out.render_audio",
      { text: "Hello world", voice: "Samantha" },
      platform,
    );
    const artifact = result as { artifact_path: string; format: string; duration_ms: number };
    expect(artifact.artifact_path).toContain("/tmp/tts/");
    expect(artifact.artifact_path).toContain(".aiff");
    expect(artifact.format).toBe("aiff");
    expect(artifact.duration_ms).toBe("Hello world".length * 50);
  });

  it("render_audio with custom format", async () => {
    const result = await handleTts(
      "apple.speech_out.render_audio",
      { text: "Test", format: "wav" },
      platform,
    );
    const artifact = result as { artifact_path: string; format: string };
    expect(artifact.format).toBe("wav");
    expect(artifact.artifact_path).toContain(".wav");
  });

  it("unsupported voice request handled gracefully", async () => {
    // The fake doesn't reject unknown voices — it produces output regardless.
    // This tests that the system doesn't crash on unusual voice names.
    const result = await handleTts(
      "apple.speech_out.render_audio",
      { text: "Testing voices", voice: "NonexistentVoice_XYZ" },
      platform,
    );
    const artifact = result as { artifact_path: string; format: string; duration_ms: number };
    expect(artifact.artifact_path).toContain("/tmp/tts/");
    expect(artifact.duration_ms).toBeGreaterThan(0);
  });

  it("rejects missing text", async () => {
    await expect(
      handleTts("apple.speech_out.speak", {}, platform),
    ).rejects.toThrow("requires a string 'text'");

    await expect(
      handleTts("apple.speech_out.render_audio", {}, platform),
    ).rejects.toThrow("requires a string 'text'");
  });
});
