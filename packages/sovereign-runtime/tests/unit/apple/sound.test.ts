import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';

describe('Sound Analysis Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('classify returns event labels', async () => {
    const result = await adapter.execute('apple.sound.classify', {
      audioData: 'base64audio...',
    });
    const output = result.output as { events: Array<{ label: string; confidence: number; timeRange: unknown }> };
    expect(output.events).toBeInstanceOf(Array);
    expect(output.events.length).toBeGreaterThan(0);
    expect(output.events[0]).toHaveProperty('label');
    expect(output.events[0]).toHaveProperty('confidence');
    expect(output.events[0]).toHaveProperty('timeRange');
  });
});
