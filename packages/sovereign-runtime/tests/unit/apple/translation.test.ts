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
});
