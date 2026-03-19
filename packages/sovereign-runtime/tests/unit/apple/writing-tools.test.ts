import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Writing Tools Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('rewrite returns rewritten text', async () => {
    const result = await adapter.execute('apple.writing_tools.rewrite', {
      text: 'This sentence is not very good.',
    });
    const output = result.output as { rewrittenText: string };
    expect(output.rewrittenText).toBeDefined();
    expect(typeof output.rewrittenText).toBe('string');
  });

  it('proofread returns corrected text and corrections list', async () => {
    const result = await adapter.execute('apple.writing_tools.proofread', {
      text: 'This sentance has a speling error.',
    });
    const output = result.output as { correctedText: string; corrections: unknown[] };
    expect(output.correctedText).toBeDefined();
    expect(output.corrections).toBeInstanceOf(Array);
  });

  it('summarize returns summary', async () => {
    const result = await adapter.execute('apple.writing_tools.summarize', {
      text: 'A long paragraph that needs to be shortened.',
    });
    const output = result.output as { summary: string };
    expect(output.summary).toBeDefined();
  });
});
