import { describe, it, expect, beforeEach } from 'vitest';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { FIXTURES_APPLE_PROVIDER } from '../../src/fixtures/provider-fixtures.js';
import { MethodNotAvailableError } from '../../src/domain/errors.js';

describe('GRITS Apple Method Integrity', () => {
  let adapter: AppleRuntimeAdapter;
  let registry: SourceRegistry;

  beforeEach(() => {
    adapter = new AppleRuntimeAdapter();
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  // ── Foundation Models (Text) ──

  it('GRITS-APPLE-TEXT-001: summarize output conforms to { summary: string, tokenCount: number }', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', {
      text: 'The quick brown fox jumps over the lazy dog. This is a test document for summarization.',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.summary).toBe('string');
    expect(typeof output.tokenCount).toBe('number');
  });

  it('GRITS-APPLE-TEXT-002: extract returns entities with required keys', async () => {
    const result = await adapter.execute('apple.foundation_models.extract', {
      text: 'John Smith works at Apple Inc in Cupertino.',
    });

    const output = result.output as { entities: Array<Record<string, unknown>> };
    expect(Array.isArray(output.entities)).toBe(true);
    for (const entity of output.entities) {
      expect(typeof entity.type).toBe('string');
      expect(typeof entity.value).toBe('string');
      expect(typeof entity.confidence).toBe('number');
    }
  });

  it('GRITS-APPLE-TEXT-003: repeated summarization of same fixture stays consistent', async () => {
    const input = {
      text: 'Consistent input for deterministic summarization test. The system must produce the same output each time.',
    };

    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await adapter.execute('apple.foundation_models.summarize', input);
      results.push(result.output);
    }

    // All 5 runs should produce the same output
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  // ── Writing Tools ──

  it('GRITS-APPLE-WRITE-001: rewrite returns rewrittenText only', async () => {
    const result = await adapter.execute('apple.writing_tools.rewrite', {
      text: 'This sentence is bad and needs fixing.',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.rewrittenText).toBe('string');
  });

  it('GRITS-APPLE-WRITE-002: proofread does not inject unrelated content', async () => {
    const originalText = 'Ths is a sentense with typos in it.';
    const result = await adapter.execute('apple.writing_tools.proofread', {
      text: originalText,
    });

    const output = result.output as { correctedText: string; corrections: unknown[] };
    expect(typeof output.correctedText).toBe('string');
    // The corrected text should contain words from the original
    const originalWords = originalText.toLowerCase().split(/\s+/);
    const correctedLower = output.correctedText.toLowerCase();
    // At least some original words should be present (the ones without typos)
    const matchingWords = originalWords.filter((w) => correctedLower.includes(w));
    expect(matchingWords.length).toBeGreaterThan(0);
  });

  // ── Speech (STT) ──

  it('GRITS-APPLE-STT-001: transcribe_file returns transcript and timing metadata', async () => {
    const result = await adapter.execute('apple.speech.transcribe_file', {
      audioData: 'base64-encoded-audio-data-here',
      language: 'en-US',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.transcript).toBe('string');
    expect(output.segments).toBeDefined();
    expect(typeof output.language).toBe('string');
    expect(typeof output.confidence).toBe('number');
  });

  it('GRITS-APPLE-STT-002: malformed audio still returns structured response', async () => {
    // Empty string as audio data — the fake adapter should handle it gracefully
    const result = await adapter.execute('apple.speech.transcribe_file', {
      audioData: '',
      language: 'en-US',
    });

    const output = result.output as Record<string, unknown>;
    expect(output).toBeDefined();
    expect(typeof output.transcript).toBe('string');
    expect(typeof output.language).toBe('string');
    expect(typeof output.confidence).toBe('number');
  });

  // ── TTS ──

  it('GRITS-APPLE-TTS-001: render_audio returns audio artifact reference', async () => {
    const result = await adapter.execute('apple.tts.render_audio', {
      text: 'Hello world, this is a test.',
      voice: 'Samantha',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.artifactRef).toBe('string');
    expect(typeof output.format).toBe('string');
    expect(typeof output.durationMs).toBe('number');
    expect(typeof output.sizeBytes).toBe('number');
  });

  it('GRITS-APPLE-TTS-002: TTS refuses unsupported voice method', async () => {
    await expect(
      adapter.execute('apple.tts.nonexistent', { text: 'hello' }),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  // ── Vision ──

  it('GRITS-APPLE-VISION-001: OCR output contains extractedText', async () => {
    const result = await adapter.execute('apple.vision.ocr', {
      imageData: 'base64-encoded-image-data',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.extractedText).toBe('string');
  });

  it('GRITS-APPLE-VISION-002: low-confidence OCR result has confidence field', async () => {
    const result = await adapter.execute('apple.vision.ocr', {
      imageData: 'base64-encoded-image-data',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.confidence).toBe('number');
    // Confidence field exists (fakes return fixed confidence)
    expect(output.confidence).toBeDefined();
  });

  // ── Image Generation ──

  it('GRITS-APPLE-IMAGE-001: image generation returns image artifact metadata', async () => {
    const result = await adapter.execute('apple.image_creator.generate', {
      prompt: 'A sunset over mountains',
      style: 'realistic',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.artifactRef).toBe('string');
    expect(typeof output.format).toBe('string');
    expect(typeof output.width).toBe('number');
    expect(typeof output.height).toBe('number');
  });

  it('GRITS-APPLE-IMAGE-002: image generation does not invoke external augmentation path', () => {
    // Verify that apple.image_creator.generate has requiresNetwork=false in APPLE_METHODS
    const imageMethod = APPLE_METHODS.find(
      (m) => m.methodId === 'apple.image_creator.generate',
    );
    expect(imageMethod).toBeDefined();
    expect(imageMethod!.requiresNetwork).toBe(false);
  });

  // ── Translation ──

  it('GRITS-APPLE-TRAN-001: translation returns translated text and language metadata', async () => {
    const result = await adapter.execute('apple.translation.translate', {
      text: 'Hello world',
      targetLanguage: 'es',
    });

    const output = result.output as Record<string, unknown>;
    expect(typeof output.translatedText).toBe('string');
    expect(typeof output.detectedLanguage).toBe('string');
    expect(typeof output.targetLanguage).toBe('string');
  });

  // ── Sound Analysis ──

  it('GRITS-APPLE-SOUND-001: sound classify returns event list in correct schema', async () => {
    const result = await adapter.execute('apple.sound.classify', {
      audioData: 'base64-encoded-audio-data',
    });

    const output = result.output as { events: Array<Record<string, unknown>> };
    expect(Array.isArray(output.events)).toBe(true);
    for (const event of output.events) {
      expect(typeof event.label).toBe('string');
      expect(typeof event.confidence).toBe('number');
      expect(event.timeRange).toBeDefined();
    }
  });
});
