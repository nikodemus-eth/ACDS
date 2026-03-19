import { describe, it, expect } from 'vitest';
import { resolveIntent } from '../../../src/runtime/intent-resolver.js';

describe('Intent Resolver', () => {
  it('resolves "summarize this document" to summarization', () => {
    const result = resolveIntent('summarize this document');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('summarization');
  });

  it('resolves "transcribe this audio file" to transcription', () => {
    const result = resolveIntent('transcribe this audio file');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('transcription');
  });

  it('resolves "read this report aloud" to speech_output', () => {
    const result = resolveIntent('read this report aloud');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('speech_output');
  });

  it('resolves "extract text from this screenshot" to ocr', () => {
    const result = resolveIntent('extract text from this screenshot');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('ocr');
  });

  it('resolves "translate this text" to translation', () => {
    const result = resolveIntent('translate this text');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('translation');
  });

  it('resolves "generate an image of a sunset" to image_generation', () => {
    const result = resolveIntent('generate an image of a sunset');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('image_generation');
  });

  it('resolves "classify this sound" to sound_classification', () => {
    const result = resolveIntent('classify this sound');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('sound_classification');
  });

  it('resolves "rewrite this paragraph" to text_rewrite', () => {
    const result = resolveIntent('rewrite this paragraph');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('text_rewrite');
  });

  it('resolves "proofread my essay" to text_proofread', () => {
    const result = resolveIntent('proofread my essay');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('text_proofread');
  });

  it('resolves "extract the key entities from this text" to text_extraction', () => {
    const result = resolveIntent('extract the key points from this text');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('text_extraction');
  });

  it('returns undefined for unrecognized task', () => {
    const result = resolveIntent('do something completely unknown xyz');
    expect(result).toBeUndefined();
  });

  it('is case-insensitive', () => {
    const result = resolveIntent('SUMMARIZE THIS DOCUMENT');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('summarization');
  });

  it('handles speech-to-text alias', () => {
    const result = resolveIntent('speech-to-text conversion');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('transcription');
  });

  it('handles TTS alias', () => {
    const result = resolveIntent('use tts to read this');
    expect(result).toBeDefined();
    expect(result!.intent).toBe('speech_output');
  });

  it('handles OCR with image variants', () => {
    expect(resolveIntent('extract text from image')!.intent).toBe('ocr');
    expect(resolveIntent('extract text from photo')!.intent).toBe('ocr');
    expect(resolveIntent('extract text from scan')!.intent).toBe('ocr');
  });
});
