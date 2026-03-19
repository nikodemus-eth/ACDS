import { describe, it, expect } from 'vitest';
import { scoreProviders } from '../../src/runtime/provider-scorer.js';
import { DEFAULT_WEIGHTS } from '../../src/domain/score-types.js';
import { FREE_COST, LOCAL_LATENCY } from '../../src/domain/cost-types.js';
import type { CapabilityBinding } from '../../src/registry/capability-binding.js';

function makeBinding(overrides: Partial<CapabilityBinding> = {}): CapabilityBinding {
  return {
    capabilityId: 'text.generate',
    capabilityVersion: '1.0',
    providerId: 'provider-a',
    methodId: 'method-a',
    cost: FREE_COST,
    latency: LOCAL_LATENCY,
    reliability: 0.95,
    locality: 'local',
    ...overrides,
  };
}

describe('scoreProviders', () => {
  describe('constraint filtering', () => {
    it('filters by localOnly constraint', () => {
      const bindings = [
        makeBinding({ providerId: 'local', locality: 'local' }),
        makeBinding({ providerId: 'remote', methodId: 'method-r', locality: 'remote' }),
      ];
      const result = scoreProviders(bindings, { localOnly: true });
      expect(result.scores).toHaveLength(1);
      expect(result.winner.providerId).toBe('local');
    });

    it('filters by maxLatencyMs constraint', () => {
      const bindings = [
        makeBinding({ providerId: 'fast', latency: { p50: 10, p95: 50, p99: 100 } }),
        makeBinding({ providerId: 'slow', methodId: 'method-s', latency: { p50: 500, p95: 2000, p99: 5000 } }),
      ];
      const result = scoreProviders(bindings, { maxLatencyMs: 100 });
      expect(result.scores).toHaveLength(1);
      expect(result.winner.providerId).toBe('fast');
    });

    it('filters by maxCostUSD constraint', () => {
      const bindings = [
        makeBinding({ providerId: 'cheap', cost: { model: 'per_request', unitCost: 0.001, currency: 'USD' } }),
        makeBinding({
          providerId: 'expensive',
          methodId: 'method-e',
          cost: { model: 'per_request', unitCost: 1.0, currency: 'USD' },
        }),
      ];
      const result = scoreProviders(bindings, { maxCostUSD: 0.01 });
      expect(result.scores).toHaveLength(1);
      expect(result.winner.providerId).toBe('cheap');
    });

    it('returns empty result when no providers pass constraints', () => {
      const bindings = [makeBinding({ locality: 'remote' })];
      const result = scoreProviders(bindings, { localOnly: true });
      expect(result.scores).toHaveLength(0);
      expect(result.winner).toBeUndefined();
      expect(result.explanation).toContain('No eligible');
    });
  });

  describe('scoring logic', () => {
    it('prefers free local providers over paid remote ones', () => {
      const bindings = [
        makeBinding({
          providerId: 'apple',
          methodId: 'apple.gen',
          cost: FREE_COST,
          latency: LOCAL_LATENCY,
          reliability: 0.95,
          locality: 'local',
        }),
        makeBinding({
          providerId: 'openai',
          methodId: 'openai.gen',
          cost: { model: 'per_token', unitCost: 0.002, currency: 'USD' },
          latency: { p50: 300, p95: 800, p99: 2000 },
          reliability: 0.99,
          locality: 'remote',
        }),
      ];
      const result = scoreProviders(bindings, {});
      expect(result.winner.providerId).toBe('apple');
    });

    it('respects custom weights favoring reliability', () => {
      const bindings = [
        makeBinding({
          providerId: 'reliable',
          methodId: 'r.gen',
          reliability: 0.999,
          locality: 'remote',
        }),
        makeBinding({
          providerId: 'unreliable',
          methodId: 'u.gen',
          reliability: 0.5,
          locality: 'local',
        }),
      ];
      const result = scoreProviders(bindings, {}, {
        cost: 0.0,
        latency: 0.0,
        reliability: 1.0,
        locality: 0.0,
      });
      expect(result.winner.providerId).toBe('reliable');
    });

    it('scores are between 0 and 1 for each dimension', () => {
      const bindings = [
        makeBinding({ providerId: 'a', methodId: 'a.gen' }),
        makeBinding({ providerId: 'b', methodId: 'b.gen', reliability: 0.5 }),
      ];
      const result = scoreProviders(bindings, {});
      for (const score of result.scores) {
        expect(score.costScore).toBeGreaterThanOrEqual(0);
        expect(score.costScore).toBeLessThanOrEqual(1);
        expect(score.latencyScore).toBeGreaterThanOrEqual(0);
        expect(score.latencyScore).toBeLessThanOrEqual(1);
        expect(score.reliabilityScore).toBeGreaterThanOrEqual(0);
        expect(score.reliabilityScore).toBeLessThanOrEqual(1);
        expect(score.localityScore).toBeGreaterThanOrEqual(0);
        expect(score.localityScore).toBeLessThanOrEqual(1);
      }
    });

    it('results are sorted descending by totalScore', () => {
      const bindings = [
        makeBinding({ providerId: 'c', methodId: 'c.gen', reliability: 0.3 }),
        makeBinding({ providerId: 'a', methodId: 'a.gen', reliability: 0.99 }),
        makeBinding({ providerId: 'b', methodId: 'b.gen', reliability: 0.7 }),
      ];
      const result = scoreProviders(bindings, {});
      for (let i = 1; i < result.scores.length; i++) {
        expect(result.scores[i - 1].totalScore).toBeGreaterThanOrEqual(result.scores[i].totalScore);
      }
    });

    it('winner is the first element of sorted scores', () => {
      const bindings = [
        makeBinding({ providerId: 'low', methodId: 'low.gen', reliability: 0.1 }),
        makeBinding({ providerId: 'high', methodId: 'high.gen', reliability: 0.99 }),
      ];
      const result = scoreProviders(bindings, {});
      expect(result.winner).toEqual(result.scores[0]);
    });

    it('explanation includes winner info', () => {
      const bindings = [makeBinding()];
      const result = scoreProviders(bindings, {});
      expect(result.explanation).toContain('Selected');
      expect(result.explanation).toContain('provider-a');
      expect(result.explanation).toContain('method-a');
    });
  });

  describe('single provider', () => {
    it('scores a single provider correctly', () => {
      const bindings = [makeBinding()];
      const result = scoreProviders(bindings, {});
      expect(result.scores).toHaveLength(1);
      expect(result.winner).toBeDefined();
      expect(result.winner.totalScore).toBeGreaterThan(0);
    });
  });
});
