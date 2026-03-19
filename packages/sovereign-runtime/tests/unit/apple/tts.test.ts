import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('TTS Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('speak returns completion status', async () => {
    const result = await adapter.execute('apple.tts.speak', {
      text: 'Hello, world.',
    });
    const output = result.output as { status: string; durationMs: number };
    expect(output.status).toBe('completed');
    expect(output.durationMs).toBeGreaterThan(0);
  });

  it('render_audio returns audio artifact reference', async () => {
    const result = await adapter.execute('apple.tts.render_audio', {
      text: 'This report describes the quarterly results.',
    });
    const output = result.output as { artifactRef: string; format: string; durationMs: number; sizeBytes: number };
    expect(output.artifactRef).toMatch(/^audio:\/\//);
    expect(output.format).toBe('m4a');
    expect(output.durationMs).toBeGreaterThan(0);
    expect(output.sizeBytes).toBeGreaterThan(0);
  });
});
