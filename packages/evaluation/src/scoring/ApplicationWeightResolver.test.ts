import { describe, it, expect } from 'vitest';
import { resolveApplicationWeights } from './ApplicationWeightResolver.js';

describe('resolveApplicationWeights', () => {
  it('returns thingstead-specific weights', () => {
    const weights = resolveApplicationWeights('thingstead');
    expect(weights.acceptance).toBe(3.0);
    expect(weights['correction-burden']).toBe(2.5);
    expect(weights['unsupported-claims']).toBe(2.5);
  });

  it('returns process-swarm-specific weights', () => {
    const weights = resolveApplicationWeights('process-swarm');
    expect(weights.acceptance).toBe(3.0);
    expect(weights.latency).toBe(2.5);
  });

  it('is case-insensitive for known applications', () => {
    const weights = resolveApplicationWeights('Thingstead');
    expect(weights.acceptance).toBe(3.0);
  });

  it('returns default equal weights for unknown applications', () => {
    const weights = resolveApplicationWeights('unknown-app');
    expect(weights.acceptance).toBe(1.0);
    expect(weights.latency).toBe(1.0);
    expect(weights.cost).toBe(1.0);
    expect(weights['schema-compliance']).toBe(1.0);
    expect(weights['correction-burden']).toBe(1.0);
    expect(weights['unsupported-claims']).toBe(1.0);
  });

  it('returns a new object for unknown apps (not shared reference)', () => {
    const w1 = resolveApplicationWeights('app-a');
    const w2 = resolveApplicationWeights('app-b');
    expect(w1).not.toBe(w2);
    expect(w1).toEqual(w2);
  });
});
