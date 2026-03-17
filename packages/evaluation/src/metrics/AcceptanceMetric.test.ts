import { describe, it, expect } from 'vitest';
import { evaluateAcceptance } from './AcceptanceMetric.js';

describe('evaluateAcceptance', () => {
  it('returns score 1.0 for accepted outcome', () => {
    const result = evaluateAcceptance({ acceptance: 'accepted' });
    expect(result.score).toBe(1.0);
    expect(result.label).toBe('acceptance');
    expect(result.details.outcome).toBe('accepted');
  });

  it('returns score 0.5 for partial outcome', () => {
    const result = evaluateAcceptance({ acceptance: 'partial' });
    expect(result.score).toBe(0.5);
    expect(result.details.outcome).toBe('partial');
  });

  it('returns score 0.0 for rejected outcome', () => {
    const result = evaluateAcceptance({ acceptance: 'rejected' });
    expect(result.score).toBe(0.0);
    expect(result.details.outcome).toBe('rejected');
  });
});
