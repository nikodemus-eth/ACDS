import { describe, it, expect } from 'vitest';
import { LineageBuilder } from './lineage-builder.js';

describe('LineageBuilder', () => {
  it('builds lineage with steps', () => {
    const builder = new LineageBuilder('exec-1', 'text.generate');
    builder.addStep('request', { task: 'summarize' });
    builder.addStep('policy', { allowed: true });
    builder.addStep('execution', { provider: 'apple' });
    const lineage = builder.build();
    expect(lineage.executionId).toBe('exec-1');
    expect(lineage.capabilityId).toBe('text.generate');
    expect(lineage.steps).toHaveLength(3);
    expect(lineage.steps[0].phase).toBe('request');
    expect(lineage.steps[1].phase).toBe('policy');
    expect(lineage.steps[2].phase).toBe('execution');
    expect(lineage.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('builds empty lineage with no steps', () => {
    const builder = new LineageBuilder('exec-2', 'speech.transcribe');
    const lineage = builder.build();
    expect(lineage.steps).toHaveLength(0);
    expect(lineage.executionId).toBe('exec-2');
  });

  it('each step has a timestamp', () => {
    const builder = new LineageBuilder('exec-3', 'test');
    builder.addStep('scoring', { score: 0.9 });
    const lineage = builder.build();
    expect(lineage.steps[0].timestamp).toBeTruthy();
    expect(lineage.steps[0].details.score).toBe(0.9);
  });
});
