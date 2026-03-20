import { describe, it, expect } from 'vitest';
import { visionNormalizer, VISION_ENTRIES } from '../../../../src/artifact/families/vision.js';

describe('Vision Family', () => {
  const describeEntry = VISION_ENTRIES.find(e => e.artifact_type === 'ACDS.Vision.Describe')!;
  const extractEntry = VISION_ENTRIES.find(e => e.artifact_type === 'ACDS.Vision.Extract.Text')!;
  const classifyEntry = VISION_ENTRIES.find(e => e.artifact_type === 'ACDS.Vision.Classify')!;
  const contextualizeEntry = VISION_ENTRIES.find(e => e.artifact_type === 'ACDS.Vision.Contextualize')!;

  describe('normalizeInput', () => {
    it('Describe: validates imageData', () => {
      const result = visionNormalizer.normalizeInput(
        { imageData: 'base64data' },
        describeEntry,
      ) as Record<string, unknown>;
      expect(result.imageData).toBe('base64data');
    });

    it('Describe: throws on missing imageData', () => {
      expect(() => visionNormalizer.normalizeInput({}, describeEntry)).toThrow('imageData');
    });

    it('Describe: throws on empty imageData', () => {
      expect(() => visionNormalizer.normalizeInput({ imageData: '' }, describeEntry)).toThrow('imageData');
    });

    it('Extract.Text: validates imageData', () => {
      const result = visionNormalizer.normalizeInput(
        { imageData: 'ocr_data' },
        extractEntry,
      ) as Record<string, unknown>;
      expect(result.imageData).toBe('ocr_data');
    });

    it('Classify: validates text field', () => {
      const result = visionNormalizer.normalizeInput(
        { text: 'a photo of a dog', labels: ['dog', 'cat'] },
        classifyEntry,
      ) as Record<string, unknown>;
      expect(result.text).toBe('a photo of a dog');
      expect(result.labels).toEqual(['dog', 'cat']);
    });

    it('Classify: throws on missing text', () => {
      expect(() => visionNormalizer.normalizeInput({}, classifyEntry)).toThrow('text');
    });

    it('Contextualize: includes context field', () => {
      const result = visionNormalizer.normalizeInput(
        { imageData: 'data', context: 'taken at sunset' },
        contextualizeEntry,
      ) as Record<string, unknown>;
      expect(result.imageData).toBe('data');
      expect(result.context).toBe('taken at sunset');
    });
  });

  describe('normalizeOutput', () => {
    it('Describe: returns description and tags', () => {
      const result = visionNormalizer.normalizeOutput(
        { description: 'a sunset', tags: ['sunset', 'sky'], confidence: 0.9 },
        describeEntry,
      );
      expect((result.primary as Record<string, unknown>).description).toBe('a sunset');
      expect((result.secondary as Record<string, unknown>).confidence).toBe(0.9);
    });

    it('Extract: returns extracted text', () => {
      const result = visionNormalizer.normalizeOutput(
        { extractedText: 'Hello World', confidence: 0.95 },
        extractEntry,
      );
      expect((result.primary as Record<string, unknown>).extracted_text).toBe('Hello World');
    });

    it('Classify: returns label and confidence', () => {
      const result = visionNormalizer.normalizeOutput(
        { label: 'dog', confidence: 0.88 },
        classifyEntry,
      );
      expect((result.primary as Record<string, unknown>).label).toBe('dog');
    });

    it('Contextualize: returns description and confidence', () => {
      const result = visionNormalizer.normalizeOutput(
        { description: 'sunset beach', tags: ['beach'], confidence: 0.85 },
        contextualizeEntry,
      );
      expect((result.primary as Record<string, unknown>).description).toBe('sunset beach');
    });
  });

  describe('summarizeInput', () => {
    it('reports image source modality', () => {
      const summary = visionNormalizer.summarizeInput(
        { imageData: 'x'.repeat(1000) },
        describeEntry,
      );
      expect(summary.source_modality).toBe('image');
      expect(summary.input_size).toBe(1000);
    });
  });

  describe('registry entries', () => {
    it('has 4 entries', () => {
      expect(VISION_ENTRIES).toHaveLength(4);
    });

    it('Describe maps to image.describe', () => {
      expect(describeEntry.capability_id).toBe('image.describe');
    });

    it('Extract.Text maps to image.ocr', () => {
      expect(extractEntry.capability_id).toBe('image.ocr');
    });

    it('Classify maps to text.classify', () => {
      expect(classifyEntry.capability_id).toBe('text.classify');
    });

    it('Contextualize maps to image.describe', () => {
      expect(contextualizeEntry.capability_id).toBe('image.describe');
    });

    it('output modality is vision_result', () => {
      for (const entry of VISION_ENTRIES) {
        expect(entry.output_modality).toBe('vision_result');
      }
    });
  });
});
