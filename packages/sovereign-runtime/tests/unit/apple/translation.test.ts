import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Translation Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('translate returns translated text and language metadata', async () => {
    const result = await adapter.execute('apple.translation.translate', {
      text: 'Hello, how are you?',
      targetLanguage: 'es',
    });
    const output = result.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.translatedText).toBeDefined();
    expect(output.detectedLanguage).toBe('en');
    expect(output.targetLanguage).toBe('es');
  });

  it('translate with unsupported target language falls back to bracketed output', async () => {
    const result = await adapter.execute('apple.translation.translate', {
      text: 'Hello world',
      targetLanguage: 'ja',
    });
    const output = result.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.translatedText).toContain('[ja]');
    expect(output.targetLanguage).toBe('ja');
    expect(output.detectedLanguage).toBe('en');
  });

  it('translate detects French input language', async () => {
    const result = await adapter.execute('apple.translation.translate', {
      text: 'Bonjour monde',
      targetLanguage: 'en',
    });
    const output = result.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.detectedLanguage).toBe('fr');
  });

  it('translate detects Spanish input language from punctuation', async () => {
    const result = await adapter.execute('apple.translation.translate', {
      text: '\u00bfhola amigo?',
      targetLanguage: 'en',
    });
    const output = result.output as { translatedText: string; detectedLanguage: string; targetLanguage: string };
    expect(output.detectedLanguage).toBe('es');
  });
});
