import { describe, it, expect } from 'vitest';
import { expressionNormalizer, EXPRESSION_ENTRIES } from '../../../../src/artifact/families/expression.js';

describe('Expression Family', () => {
  const inlineEntry = EXPRESSION_ENTRIES.find(e => e.artifact_type === 'ACDS.Expression.Generate.Inline')!;
  const reactionEntry = EXPRESSION_ENTRIES.find(e => e.artifact_type === 'ACDS.Expression.Generate.Reaction')!;

  describe('normalizeInput', () => {
    it('normalizes inline expression with inline style', () => {
      const result = expressionNormalizer.normalizeInput(
        { prompt: 'happy cat emoji' },
        inlineEntry,
      ) as Record<string, unknown>;
      expect(result.prompt).toBe('happy cat emoji');
      expect(result.style).toBe('inline');
    });

    it('normalizes reaction expression with reaction style', () => {
      const result = expressionNormalizer.normalizeInput(
        { prompt: 'thumbs up' },
        reactionEntry,
      ) as Record<string, unknown>;
      expect(result.style).toBe('reaction');
    });

    it('throws on missing prompt', () => {
      expect(() => expressionNormalizer.normalizeInput({}, inlineEntry)).toThrow('prompt');
    });

    it('throws on empty prompt', () => {
      expect(() => expressionNormalizer.normalizeInput({ prompt: '' }, inlineEntry)).toThrow('prompt');
    });
  });

  describe('normalizeOutput', () => {
    it('extracts image_uri and format', () => {
      const result = expressionNormalizer.normalizeOutput(
        { artifactRef: 'file:///emoji.png', format: 'png', width: 64, height: 64 },
        inlineEntry,
      );
      expect((result.primary as Record<string, unknown>).image_uri).toBe('file:///emoji.png');
      expect((result.primary as Record<string, unknown>).format).toBe('png');
    });

    it('includes dimensions in secondary', () => {
      const result = expressionNormalizer.normalizeOutput(
        { artifactRef: 'ref', width: 128, height: 128 },
        reactionEntry,
      );
      const secondary = result.secondary as Record<string, unknown>;
      expect(secondary.dimensions).toEqual({ width: 128, height: 128 });
    });
  });

  describe('summarizeInput', () => {
    it('produces summary with text modality', () => {
      const summary = expressionNormalizer.summarizeInput(
        { prompt: 'test emoji' },
        inlineEntry,
      );
      expect(summary.source_modality).toBe('text');
      expect(summary.input_class).toBe('expression_inline');
    });

    it('truncates long prompts', () => {
      const summary = expressionNormalizer.summarizeInput(
        { prompt: 'x'.repeat(200) },
        inlineEntry,
      );
      expect(summary.summary.length).toBeLessThanOrEqual(80);
    });
  });

  describe('registry entries', () => {
    it('has 2 entries', () => {
      expect(EXPRESSION_ENTRIES).toHaveLength(2);
    });

    it('Inline is apple-only', () => {
      expect(inlineEntry.provider_disposition).toBe('apple-only');
    });

    it('Reaction is apple-preferred', () => {
      expect(reactionEntry.provider_disposition).toBe('apple-preferred');
    });

    it('both map to image.generate', () => {
      for (const entry of EXPRESSION_ENTRIES) {
        expect(entry.capability_id).toBe('image.generate');
      }
    });

    it('output modality is expression', () => {
      for (const entry of EXPRESSION_ENTRIES) {
        expect(entry.output_modality).toBe('expression');
      }
    });
  });
});
