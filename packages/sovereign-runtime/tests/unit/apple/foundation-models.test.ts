import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Foundation Models Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('generate returns text output', async () => {
    const result = await adapter.execute('apple.foundation_models.generate', {
      text: 'Write a poem about the ocean',
    });
    const output = result.output as { generatedText: string; tokenCount: number };
    expect(output.generatedText).toBeDefined();
    expect(typeof output.generatedText).toBe('string');
    expect(output.tokenCount).toBeGreaterThan(0);
  });

  it('summarize returns summary', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', {
      text: 'This is a long document about artificial intelligence and machine learning concepts that need to be summarized for quick reading.',
    });
    const output = result.output as { summary: string; tokenCount: number };
    expect(output.summary).toBeDefined();
    expect(typeof output.summary).toBe('string');
    expect(output.tokenCount).toBeGreaterThan(0);
  });

  it('extract returns entities', async () => {
    const result = await adapter.execute('apple.foundation_models.extract', {
      text: 'John Smith works at Acme Corp in New York.',
    });
    const output = result.output as { entities: Array<{ type: string; value: string; confidence: number }> };
    expect(output.entities).toBeInstanceOf(Array);
    expect(output.entities.length).toBeGreaterThan(0);
    expect(output.entities[0]).toHaveProperty('type');
    expect(output.entities[0]).toHaveProperty('value');
    expect(output.entities[0]).toHaveProperty('confidence');
  });

  it('extract falls back to text_fragment when no proper nouns or numbers found', async () => {
    const result = await adapter.execute('apple.foundation_models.extract', {
      text: 'just lowercase words without any names or digits here',
    });
    const output = result.output as { entities: Array<{ type: string; value: string; confidence: number }> };
    expect(output.entities).toBeInstanceOf(Array);
    expect(output.entities.length).toBe(1);
    expect(output.entities[0].type).toBe('text_fragment');
    expect(output.entities[0].confidence).toBe(0.75);
  });

  it('extract returns empty entities for empty text', async () => {
    const result = await adapter.execute('apple.foundation_models.extract', {
      text: '',
    });
    const output = result.output as { entities: Array<{ type: string; value: string; confidence: number }> };
    expect(output.entities).toBeInstanceOf(Array);
    expect(output.entities.length).toBe(0);
  });

  it('summarize with empty text returns fallback message', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', {
      text: '',
    });
    const output = result.output as { summary: string; tokenCount: number };
    expect(output.summary).toBe('No content provided.');
    expect(output.tokenCount).toBeGreaterThan(0);
  });

  it('summarize with whitespace-only text returns fallback message', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', {
      text: '   ',
    });
    const output = result.output as { summary: string; tokenCount: number };
    expect(output.summary).toBe('No content provided.');
  });

  it('extract detects numbers as entities', async () => {
    const result = await adapter.execute('apple.foundation_models.extract', {
      text: 'the value is 42 and also 3.14',
    });
    const output = result.output as { entities: Array<{ type: string; value: string; confidence: number }> };
    const numbers = output.entities.filter(e => e.type === 'number');
    expect(numbers.length).toBeGreaterThanOrEqual(2);
  });
});
