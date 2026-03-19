import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Image Generation Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('generate returns image artifact reference', async () => {
    const result = await adapter.execute('apple.image_creator.generate', {
      prompt: 'A sunset over mountains',
    });
    const output = result.output as { artifactRef: string; format: string; width: number; height: number };
    expect(output.artifactRef).toMatch(/^image:\/\//);
    expect(output.format).toBe('png');
    expect(output.width).toBe(1024);
    expect(output.height).toBe(1024);
  });
});
