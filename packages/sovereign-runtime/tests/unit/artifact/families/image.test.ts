import { describe, it, expect } from 'vitest';
import { imageNormalizer, IMAGE_ENTRIES } from '../../../../src/artifact/families/image.js';

describe('Image Family', () => {
  const stylizedEntry = IMAGE_ENTRIES.find(e => e.artifact_type === 'ACDS.Image.Generate.Stylized')!;
  const conceptEntry = IMAGE_ENTRIES.find(e => e.artifact_type === 'ACDS.Image.Generate.Concept')!;

  describe('normalizeInput', () => {
    it('validates prompt and defaults to illustration style', () => {
      const result = imageNormalizer.normalizeInput(
        { prompt: 'a sunset over mountains' },
        stylizedEntry,
      ) as Record<string, unknown>;
      expect(result.prompt).toBe('a sunset over mountains');
      expect(result.style).toBe('illustration');
    });

    it('accepts valid style override', () => {
      const result = imageNormalizer.normalizeInput(
        { prompt: 'a cat', style: 'sketch' },
        stylizedEntry,
      ) as Record<string, unknown>;
      expect(result.style).toBe('sketch');
    });

    it('defaults concept variant to concept style', () => {
      const result = imageNormalizer.normalizeInput(
        { prompt: 'a robot' },
        conceptEntry,
      ) as Record<string, unknown>;
      expect(result.style).toBe('concept');
    });

    it('rejects invalid style and falls back', () => {
      const result = imageNormalizer.normalizeInput(
        { prompt: 'a dog', style: 'invalid-style' },
        stylizedEntry,
      ) as Record<string, unknown>;
      expect(result.style).toBe('illustration');
    });

    it('throws on missing prompt', () => {
      expect(() => imageNormalizer.normalizeInput({}, stylizedEntry)).toThrow('prompt');
    });
  });

  describe('normalizeOutput', () => {
    it('extracts image URI and format', () => {
      const result = imageNormalizer.normalizeOutput(
        { artifactRef: 'file:///img.png', format: 'png', width: 512, height: 512 },
        stylizedEntry,
      );
      expect((result.primary as Record<string, unknown>).image_uri).toBe('file:///img.png');
      expect((result.secondary as Record<string, unknown>).style_applied).toBe('unknown');
    });
  });

  describe('registry entries', () => {
    it('has 3 entries', () => {
      expect(IMAGE_ENTRIES).toHaveLength(3);
    });

    it('all entries are apple-preferred', () => {
      for (const entry of IMAGE_ENTRIES) {
        expect(entry.provider_disposition).toBe('apple-preferred');
      }
    });

    it('all entries map to image.generate', () => {
      for (const entry of IMAGE_ENTRIES) {
        expect(entry.capability_id).toBe('image.generate');
      }
    });
  });
});
