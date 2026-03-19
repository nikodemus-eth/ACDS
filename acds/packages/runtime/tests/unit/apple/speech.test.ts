/**
 * Speech handler tests.
 */
import { describe, it, expect } from "vitest";
import { FakeSpeech } from "../../../src/providers/apple/apple-fakes.js";
import { handleSpeech } from "../../../src/providers/apple/methods/speech.js";

describe("Speech handler", () => {
  const platform = new FakeSpeech();

  it("transcribe_file returns transcript with confidence", async () => {
    const result = await handleSpeech(
      "apple.speech_in.transcribe_file",
      { path: "/audio/meeting.m4a" },
      platform,
    );
    const transcript = result as { text: string; confidence: number; segments: unknown[] };
    expect(transcript.text).toContain("Transcription of /audio/meeting.m4a");
    expect(transcript.confidence).toBe(0.95);
    expect(transcript.segments.length).toBeGreaterThan(0);
  });

  it("transcribe_live returns transcript", async () => {
    const result = await handleSpeech(
      "apple.speech_in.transcribe_live",
      { audio_stream: "live_mic_feed" },
      platform,
    );
    const transcript = result as { text: string; confidence: number };
    expect(transcript.text).toContain("Transcription of");
    expect(transcript.confidence).toBeGreaterThan(0);
  });

  it("transcribe_longform returns transcript", async () => {
    const result = await handleSpeech(
      "apple.speech_in.transcribe_longform",
      { path: "/audio/lecture.m4a" },
      platform,
    );
    const transcript = result as { text: string; confidence: number; segments: unknown[] };
    expect(transcript.text).toContain("Transcription of /audio/lecture.m4a");
    expect(transcript.confidence).toBe(0.94);
    expect(transcript.segments.length).toBe(2);
  });

  it("dictation_fallback returns transcript", async () => {
    const result = await handleSpeech(
      "apple.speech_in.dictation_fallback",
      { audio_stream: "dictation_input" },
      platform,
    );
    const transcript = result as { text: string; confidence: number };
    expect(transcript.text).toContain("Transcription of");
    expect(transcript.confidence).toBe(0.88);
  });

  it("malformed input fails cleanly", async () => {
    await expect(
      handleSpeech("apple.speech_in.transcribe_file", {}, platform),
    ).rejects.toThrow("requires a string 'path'");

    await expect(
      handleSpeech("apple.speech_in.transcribe_file", { path: 42 }, platform),
    ).rejects.toThrow("requires a string 'path'");

    await expect(
      handleSpeech("apple.speech_in.transcribe_live", {}, platform),
    ).rejects.toThrow("requires 'audio_stream'");
  });
});
