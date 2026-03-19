import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Speech Input Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('transcribe_file returns transcript object', async () => {
    const result = await adapter.execute('apple.speech.transcribe_file', {
      audioData: 'base64audio...',
      language: 'en',
    });
    const output = result.output as { transcript: string; segments: unknown[]; language: string; confidence: number };
    expect(output.transcript).toBeDefined();
    expect(typeof output.transcript).toBe('string');
    expect(output.segments).toBeInstanceOf(Array);
    expect(output.language).toBe('en');
    expect(output.confidence).toBeGreaterThan(0);
  });

  it('transcribe_live returns transcript', async () => {
    const result = await adapter.execute('apple.speech.transcribe_live', {
      sampleRate: 44100,
    });
    const output = result.output as { transcript: string; confidence: number };
    expect(output.transcript).toBeDefined();
    expect(output.confidence).toBeGreaterThan(0);
  });

  it('transcribe_longform returns multi-segment transcript', async () => {
    const result = await adapter.execute('apple.speech.transcribe_longform', {
      audioData: 'base64longaudio...',
    });
    const output = result.output as { transcript: string; segments: unknown[] };
    expect(output.transcript).toBeDefined();
    expect(output.segments.length).toBeGreaterThan(1);
  });

  it('dictation_fallback returns transcript', async () => {
    const result = await adapter.execute('apple.speech.dictation_fallback', {
      audioData: 'base64...',
    });
    const output = result.output as { transcript: string; confidence: number };
    expect(output.transcript).toBeDefined();
    expect(output.confidence).toBeGreaterThan(0);
  });
});
