import { describe, it, expect } from 'vitest';
import { buildCandidateId, parseCandidateId } from './CandidatePerformanceState.js';

describe('buildCandidateId', () => {
  it('joins three parts with colons', () => {
    expect(buildCandidateId('model1', 'tactic1', 'provider1')).toBe('model1:tactic1:provider1');
  });

  it('handles empty strings as parts', () => {
    expect(buildCandidateId('', '', '')).toBe('::');
  });

  it('preserves special characters in parts', () => {
    expect(buildCandidateId('gpt-4o', 'chain-of-thought', 'openai-us-east')).toBe(
      'gpt-4o:chain-of-thought:openai-us-east',
    );
  });

  it('handles parts that themselves contain colons', () => {
    // This is a valid build but will cause issues on parse
    const id = buildCandidateId('a:b', 'c', 'd');
    expect(id).toBe('a:b:c:d');
  });
});

describe('parseCandidateId', () => {
  it('parses a valid three-part candidate id', () => {
    const result = parseCandidateId('model1:tactic1:provider1');
    expect(result).toEqual({
      modelProfileId: 'model1',
      tacticProfileId: 'tactic1',
      providerId: 'provider1',
    });
  });

  it('roundtrips with buildCandidateId', () => {
    const built = buildCandidateId('alpha', 'beta', 'gamma');
    const parsed = parseCandidateId(built);
    expect(parsed.modelProfileId).toBe('alpha');
    expect(parsed.tacticProfileId).toBe('beta');
    expect(parsed.providerId).toBe('gamma');
  });

  it('throws when candidateId has fewer than three parts', () => {
    expect(() => parseCandidateId('only-one')).toThrow('Invalid candidateId');
    expect(() => parseCandidateId('two:parts')).toThrow('Invalid candidateId');
  });

  it('throws when candidateId has more than three parts', () => {
    expect(() => parseCandidateId('a:b:c:d')).toThrow('Invalid candidateId');
  });

  it('throws when candidateId has empty parts', () => {
    expect(() => parseCandidateId('::c')).toThrow('Invalid candidateId');
    expect(() => parseCandidateId('a::c')).toThrow('Invalid candidateId');
    expect(() => parseCandidateId('a:b:')).toThrow('Invalid candidateId');
  });

  it('throws when candidateId is empty string', () => {
    expect(() => parseCandidateId('')).toThrow('Invalid candidateId');
  });

  it('includes the invalid candidateId in the error message', () => {
    try {
      parseCandidateId('bad-id');
    } catch (e: unknown) {
      expect((e as Error).message).toContain('bad-id');
      expect((e as Error).message).toContain('expected format');
    }
  });

  it('parses ids with hyphens and numbers', () => {
    const result = parseCandidateId('gpt-4o:cot-v2:openai-3');
    expect(result).toEqual({
      modelProfileId: 'gpt-4o',
      tacticProfileId: 'cot-v2',
      providerId: 'openai-3',
    });
  });
});
