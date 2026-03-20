import { describe, it, expect } from 'vitest';
import { applyDisposition, isProviderEligible } from '../../../src/artifact/disposition-matrix.js';
import type { ProviderScore } from '../../../src/domain/score-types.js';

function makeScore(providerId: string, total: number): ProviderScore {
  return {
    providerId,
    methodId: `${providerId}.method`,
    totalScore: total,
    costScore: total,
    latencyScore: total,
    reliabilityScore: total,
    localityScore: total,
  };
}

describe('Disposition Matrix', () => {
  describe('isProviderEligible', () => {
    it('apple-only allows only Apple providers', () => {
      expect(isProviderEligible('apple-only', 'apple-intelligence-runtime')).toBe(true);
      expect(isProviderEligible('apple-only', 'ollama-local')).toBe(false);
    });

    it('apple-preferred allows all providers', () => {
      expect(isProviderEligible('apple-preferred', 'apple-intelligence-runtime')).toBe(true);
      expect(isProviderEligible('apple-preferred', 'ollama-local')).toBe(true);
    });

    it('apple-optional allows all providers', () => {
      expect(isProviderEligible('apple-optional', 'apple-intelligence-runtime')).toBe(true);
      expect(isProviderEligible('apple-optional', 'ollama-local')).toBe(true);
    });
  });

  describe('applyDisposition', () => {
    const appleScore = makeScore('apple-intelligence-runtime', 0.7);
    const ollamaScore = makeScore('ollama-local', 0.8);

    it('apple-only filters out non-Apple providers', () => {
      const result = applyDisposition('apple-only', [appleScore, ollamaScore]);
      expect(result).toHaveLength(1);
      expect(result[0].providerId).toBe('apple-intelligence-runtime');
    });

    it('apple-preferred boosts Apple score to sort first', () => {
      const result = applyDisposition('apple-preferred', [appleScore, ollamaScore]);
      expect(result[0].providerId).toBe('apple-intelligence-runtime');
    });

    it('apple-optional preserves original ordering', () => {
      const result = applyDisposition('apple-optional', [ollamaScore, appleScore]);
      expect(result[0].providerId).toBe('ollama-local');
    });

    it('returns empty array when apple-only has no Apple providers', () => {
      const result = applyDisposition('apple-only', [ollamaScore]);
      expect(result).toHaveLength(0);
    });
  });
});
