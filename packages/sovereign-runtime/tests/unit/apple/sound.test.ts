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

  it('classify detects alarm/beep sounds', async () => {
    const result = await adapter.execute('apple.sound.classify', {
      audioData: 'alarm beep signal',
    });
    const output = result.output as { events: Array<{ label: string; confidence: number; timeRange: { start: number; end: number } }> };
    expect(output.events).toBeInstanceOf(Array);
    expect(output.events.length).toBe(2);
    const alarmEvent = output.events.find(e => e.label === 'alarm');
    expect(alarmEvent).toBeDefined();
    expect(alarmEvent!.confidence).toBe(0.77);
    expect(alarmEvent!.timeRange.start).toBe(2.5);
  });

  it('classify detects music in audio data', async () => {
    const result = await adapter.execute('apple.sound.classify', {
      audioData: 'music playing in background',
    });
    const output = result.output as { events: Array<{ label: string; confidence: number }> };
    const musicEvent = output.events.find(e => e.label === 'music');
    expect(musicEvent).toBeDefined();
    expect(musicEvent!.confidence).toBe(0.85);
  });
});
