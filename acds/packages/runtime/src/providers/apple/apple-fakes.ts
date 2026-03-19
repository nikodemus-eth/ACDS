/**
 * Deterministic fake implementations of Apple platform interfaces.
 *
 * These are platform boundary fakes, NOT architectural mocks.
 * The entire ACDS architecture is real; only the OS-level call is faked
 * with predictable, deterministic output for testing.
 */
import type {
  AppleFoundationModelsPlatform,
  AppleSpeechPlatform,
  AppleTtsPlatform,
  AppleVisionPlatform,
  AppleWritingToolsPlatform,
  AppleImagePlatform,
  AppleTranslationPlatform,
  AppleSoundPlatform,
  ApplePlatformBundle,
  TranscriptionResult,
  AudioArtifact,
  OcrResult,
  DocumentExtractionResult,
  ProofreadResult,
  ImageArtifact,
  TranslationResult,
  SoundClassificationResult,
  GenerateOptions,
} from "./apple-interfaces.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

// ---------------------------------------------------------------------------
// FakeFoundationModels
// ---------------------------------------------------------------------------
export class FakeFoundationModels implements AppleFoundationModelsPlatform {
  async generate(prompt: string, _options?: GenerateOptions): Promise<string> {
    return `Generated response for: ${truncate(prompt, 80)}`;
  }

  async summarize(text: string): Promise<string> {
    return `Summary: ${truncate(text, 100)}`;
  }

  async extract(
    text: string,
    schema: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    const words = text.split(/\s+/);
    const keys = Object.keys(schema);
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = words[i % words.length];
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// FakeSpeech
// ---------------------------------------------------------------------------
export class FakeSpeech implements AppleSpeechPlatform {
  async transcribeLive(audioStream: unknown): Promise<TranscriptionResult> {
    const label = typeof audioStream === "string" ? audioStream : "live_stream";
    return {
      text: `Transcription of ${label}`,
      confidence: 0.93,
      segments: [{ text: `Transcription of ${label}`, start_ms: 0, end_ms: 3000 }],
    };
  }

  async transcribeFile(path: string): Promise<TranscriptionResult> {
    return {
      text: `Transcription of ${path}`,
      confidence: 0.95,
      segments: [
        { text: `Transcription of ${path}`, start_ms: 0, end_ms: 5000 },
      ],
    };
  }

  async transcribeLongform(path: string): Promise<TranscriptionResult> {
    return {
      text: `Transcription of ${path}`,
      confidence: 0.94,
      segments: [
        { text: `Part 1 of ${path}`, start_ms: 0, end_ms: 30000 },
        { text: `Part 2 of ${path}`, start_ms: 30000, end_ms: 60000 },
      ],
    };
  }

  async dictationFallback(audioStream: unknown): Promise<TranscriptionResult> {
    const label = typeof audioStream === "string" ? audioStream : "dictation_stream";
    return {
      text: `Transcription of ${label}`,
      confidence: 0.88,
      segments: [{ text: `Transcription of ${label}`, start_ms: 0, end_ms: 2000 }],
    };
  }
}

// ---------------------------------------------------------------------------
// FakeTts
// ---------------------------------------------------------------------------
export class FakeTts implements AppleTtsPlatform {
  async speak(_text: string, _voice?: string): Promise<void> {
    // Simulate speak with no return value
  }

  async renderAudio(
    text: string,
    voice?: string,
    format?: string,
  ): Promise<AudioArtifact> {
    const hash = simpleHash(text + (voice ?? "default"));
    const fmt = format ?? "aiff";
    return {
      artifact_path: `/tmp/tts/${hash}.${fmt}`,
      format: fmt,
      duration_ms: text.length * 50,
    };
  }
}

// ---------------------------------------------------------------------------
// FakeVision
// ---------------------------------------------------------------------------
export class FakeVision implements AppleVisionPlatform {
  async ocr(imagePath: string): Promise<OcrResult> {
    return {
      text: `OCR result from ${imagePath}`,
      confidence: 0.92,
      regions: [
        { text: `OCR result from ${imagePath}`, x: 0, y: 0, width: 800, height: 600 },
      ],
    };
  }

  async documentExtract(imagePath: string): Promise<DocumentExtractionResult> {
    return {
      text: `Document text from ${imagePath}`,
      fields: {
        title: `Title from ${imagePath}`,
        date: "2026-01-01",
      },
      confidence: 0.90,
    };
  }
}

// ---------------------------------------------------------------------------
// FakeWritingTools
// ---------------------------------------------------------------------------
export class FakeWritingTools implements AppleWritingToolsPlatform {
  async rewrite(text: string, _tone?: string): Promise<string> {
    return `Rewritten: ${text}`;
  }

  async proofread(text: string): Promise<ProofreadResult> {
    return {
      corrected: text,
      suggestions: [
        { original: "teh", suggestion: "the", offset: 0 },
      ],
    };
  }

  async summarize(text: string): Promise<string> {
    return `Writing summary: ${truncate(text, 100)}`;
  }
}

// ---------------------------------------------------------------------------
// FakeImage
// ---------------------------------------------------------------------------
export class FakeImage implements AppleImagePlatform {
  async generate(prompt: string, _style?: string): Promise<ImageArtifact> {
    const hash = simpleHash(prompt);
    return {
      artifact_path: `/tmp/image/${hash}.png`,
      width: 1024,
      height: 1024,
    };
  }
}

// ---------------------------------------------------------------------------
// FakeTranslation
// ---------------------------------------------------------------------------
export class FakeTranslation implements AppleTranslationPlatform {
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    return {
      translated: `[${targetLang}] ${text}`,
      source_language: "en",
      target_language: targetLang,
    };
  }
}

// ---------------------------------------------------------------------------
// FakeSound
// ---------------------------------------------------------------------------
export class FakeSound implements AppleSoundPlatform {
  async classify(_audioPath: string): Promise<SoundClassificationResult> {
    return {
      events: [
        { label: "speech", confidence: 0.88 },
        { label: "music", confidence: 0.12 },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Bundle factory
// ---------------------------------------------------------------------------
export function createFakePlatformBundle(): ApplePlatformBundle {
  return {
    foundationModels: new FakeFoundationModels(),
    speech: new FakeSpeech(),
    tts: new FakeTts(),
    vision: new FakeVision(),
    writingTools: new FakeWritingTools(),
    image: new FakeImage(),
    translation: new FakeTranslation(),
    sound: new FakeSound(),
  };
}
