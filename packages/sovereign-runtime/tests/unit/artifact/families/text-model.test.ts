import { describe, it, expect } from 'vitest';
import { textModelNormalizer, TEXT_MODEL_ENTRIES } from '../../../../src/artifact/families/text-model.js';

describe('TextModel Family', () => {
  const classifyEntry = TEXT_MODEL_ENTRIES.find(e => e.artifact_type === 'ACDS.TextModel.Classify')!;
  const extractEntry = TEXT_MODEL_ENTRIES.find(e => e.artifact_type === 'ACDS.TextModel.Extract')!;
  const rankEntry = TEXT_MODEL_ENTRIES.find(e => e.artifact_type === 'ACDS.TextModel.Rank')!;
  const answerEntry = TEXT_MODEL_ENTRIES.find(e => e.artifact_type === 'ACDS.TextModel.Answer.Bounded')!;

  describe('normalizeInput', () => {
    it('classify: validates text and passes labels', () => {
      const result = textModelNormalizer.normalizeInput(
        { text: 'test', labels: ['a', 'b'] },
        classifyEntry,
      ) as Record<string, unknown>;
      expect(result.text).toBe('test');
      expect(result.labels).toEqual(['a', 'b']);
    });

    it('classify: throws on missing text', () => {
      expect(() => textModelNormalizer.normalizeInput({}, classifyEntry)).toThrow('text');
    });

    it('extract: validates text', () => {
      const result = textModelNormalizer.normalizeInput(
        { text: 'extract from this' },
        extractEntry,
      ) as Record<string, unknown>;
      expect(result.text).toBe('extract from this');
    });

    it('rank: requires candidates array', () => {
      expect(() => textModelNormalizer.normalizeInput(
        { text: 'query', candidates: [] },
        rankEntry,
      )).toThrow('candidates');
    });

    it('rank: passes candidates as labels', () => {
      const result = textModelNormalizer.normalizeInput(
        { text: 'query', candidates: ['a', 'b', 'c'] },
        rankEntry,
      ) as Record<string, unknown>;
      expect(result.labels).toEqual(['a', 'b', 'c']);
    });

    it('answer: validates prompt', () => {
      const result = textModelNormalizer.normalizeInput(
        { prompt: 'What is 2+2?' },
        answerEntry,
      ) as Record<string, unknown>;
      expect(result.prompt).toBe('What is 2+2?');
      expect(result.maxTokens).toBe(512);
    });
  });

  describe('normalizeOutput', () => {
    it('classify: returns label and confidence', () => {
      const result = textModelNormalizer.normalizeOutput(
        { label: 'positive', confidence: 0.9 },
        classifyEntry,
      );
      expect((result.primary as Record<string, unknown>).label).toBe('positive');
    });

    it('extract: returns entities', () => {
      const entities = [{ type: 'PERSON', value: 'John', confidence: 0.95 }];
      const result = textModelNormalizer.normalizeOutput({ entities }, extractEntry);
      expect((result.primary as Record<string, unknown>).entities).toEqual(entities);
    });

    it('answer: returns text and token count', () => {
      const result = textModelNormalizer.normalizeOutput(
        { text: 'Four', tokenCount: 1 },
        answerEntry,
      );
      expect((result.primary as Record<string, unknown>).text).toBe('Four');
    });
  });

  describe('registry entries', () => {
    it('has 4 entries', () => {
      expect(TEXT_MODEL_ENTRIES).toHaveLength(4);
    });

    it('all entries are apple-optional', () => {
      for (const entry of TEXT_MODEL_ENTRIES) {
        expect(entry.provider_disposition).toBe('apple-optional');
      }
    });
  });
});
