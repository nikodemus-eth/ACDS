import { describe, it, expect } from 'vitest';
import { applyDisposition, isProviderEligible, getAppleProviderId } from './disposition-matrix.js';
import type { ProviderScore } from '../domain/score-types.js';

function makeScore(providerId: string, totalScore: number): ProviderScore {
  return { providerId, methodId: 'test', totalScore, costScore: 0.5, latencyScore: 0.5, reliabilityScore: 0.9, localityScore: providerId.includes('apple') ? 1.0 : 0.0 };
}

describe('Disposition Matrix', () => {
  it('apple-only filters non-Apple providers', () => {
    const scores = [makeScore('apple-intelligence-runtime', 0.8), makeScore('ollama-local', 0.9)];
    const result = applyDisposition('apple-only', scores);
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe('apple-intelligence-runtime');
  });

  it('apple-preferred boosts Apple score', () => {
    const scores = [makeScore('apple-intelligence-runtime', 0.7), makeScore('ollama-local', 0.85)];
    const result = applyDisposition('apple-preferred', scores);
    expect(result[0].providerId).toBe('apple-intelligence-runtime');
    expect(result[0].totalScore).toBeCloseTo(0.9);
  });

  it('apple-preferred caps boosted score at 1.0', () => {
    const scores = [makeScore('apple-intelligence-runtime', 0.95)];
    const result = applyDisposition('apple-preferred', scores);
    expect(result[0].totalScore).toBe(1.0);
  });

  it('apple-optional returns scores unchanged', () => {
    const scores = [makeScore('ollama-local', 0.9)];
    const result = applyDisposition('apple-optional', scores);
    expect(result).toEqual(scores);
  });

  it('returns empty array for empty input', () => {
    expect(applyDisposition('apple-only', [])).toEqual([]);
  });

  it('isProviderEligible blocks non-Apple for apple-only', () => {
    expect(isProviderEligible('apple-only', 'apple-intelligence-runtime')).toBe(true);
    expect(isProviderEligible('apple-only', 'ollama-local')).toBe(false);
  });

  it('isProviderEligible allows all for apple-preferred', () => {
    expect(isProviderEligible('apple-preferred', 'ollama-local')).toBe(true);
  });

  it('isProviderEligible allows all for apple-optional', () => {
    expect(isProviderEligible('apple-optional', 'any-provider')).toBe(true);
  });

  it('getAppleProviderId returns correct ID', () => {
    expect(getAppleProviderId()).toBe('apple-intelligence-runtime');
  });
});
