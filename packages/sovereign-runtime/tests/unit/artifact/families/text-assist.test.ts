import { describe, it, expect } from 'vitest';
import { textAssistNormalizer, TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';

describe('TextAssist Family', () => {
  const rewriteEntry = TEXT_ASSIST_ENTRIES.find(e => e.artifact_type === 'ACDS.TextAssist.Rewrite.Short')!;
  const summarizeEntry = TEXT_ASSIST_ENTRIES.find(e => e.artifact_type === 'ACDS.TextAssist.Summarize.Short')!;
  const proofreadEntry = TEXT_ASSIST_ENTRIES.find(e => e.artifact_type === 'ACDS.TextAssist.Proofread')!;

  describe('normalizeInput', () => {
    it('normalizes rewrite input with text field', () => {
      const result = textAssistNormalizer.normalizeInput(
        { source_text: 'hello world' },
        rewriteEntry,
      ) as Record<string, unknown>;
      expect(result.text).toBe('hello world');
      expect(result.style).toBe('default');
    });

    it('normalizes rewrite input with tone', () => {
      const result = textAssistNormalizer.normalizeInput(
        { source_text: 'hello', tone: 'formal' },
        rewriteEntry,
      ) as Record<string, unknown>;
      expect(result.style).toBe('formal');
    });

    it('normalizes summarize input', () => {
      const result = textAssistNormalizer.normalizeInput(
        { source_text: 'long text to summarize' },
        summarizeEntry,
      ) as Record<string, unknown>;
      expect(result.text).toBe('long text to summarize');
    });

    it('throws on missing source_text', () => {
      expect(() => textAssistNormalizer.normalizeInput({}, rewriteEntry)).toThrow('source_text');
    });

    it('throws on empty source_text', () => {
      expect(() => textAssistNormalizer.normalizeInput({ source_text: '' }, rewriteEntry)).toThrow();
    });
  });

  describe('normalizeOutput', () => {
    it('extracts rewrittenText for rewrite', () => {
      const result = textAssistNormalizer.normalizeOutput(
        { rewrittenText: 'improved' },
        rewriteEntry,
      );
      expect((result.primary as Record<string, unknown>).text).toBe('improved');
    });

    it('extracts summary for summarize', () => {
      const result = textAssistNormalizer.normalizeOutput(
        { summary: 'short version' },
        summarizeEntry,
      );
      expect((result.primary as Record<string, unknown>).text).toBe('short version');
    });

    it('extracts correctedText for proofread', () => {
      const result = textAssistNormalizer.normalizeOutput(
        { correctedText: 'fixed text', corrections: [{ original: 'teh', corrected: 'the', position: 0 }] },
        proofreadEntry,
      );
      expect((result.primary as Record<string, unknown>).text).toBe('fixed text');
      expect((result.secondary as Record<string, unknown>).edit_summary).toContain('1 correction');
    });
  });

  describe('summarizeInput', () => {
    it('produces input summary with correct modality', () => {
      const summary = textAssistNormalizer.summarizeInput(
        { source_text: 'test text' },
        rewriteEntry,
      );
      expect(summary.source_modality).toBe('text');
      expect(summary.input_class).toBe('text_assist_rewrite');
      expect(summary.input_size).toBe(9);
    });

    it('truncates long text in summary', () => {
      const longText = 'a'.repeat(200);
      const summary = textAssistNormalizer.summarizeInput(
        { source_text: longText },
        rewriteEntry,
      );
      expect(summary.summary.length).toBeLessThanOrEqual(80);
      expect(summary.summary).toContain('...');
    });
  });

  describe('registry entries', () => {
    it('has 4 entries', () => {
      expect(TEXT_ASSIST_ENTRIES).toHaveLength(4);
    });

    it('all entries are apple-preferred', () => {
      for (const entry of TEXT_ASSIST_ENTRIES) {
        expect(entry.provider_disposition).toBe('apple-preferred');
      }
    });

    it('all entries map to valid capability IDs', () => {
      const validIds = ['text.rewrite', 'text.summarize', 'text.proofread'];
      for (const entry of TEXT_ASSIST_ENTRIES) {
        expect(validIds).toContain(entry.capability_id);
      }
    });
  });
});
