import { describe, it, expect } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';
import { performOCR, extractDocument } from '../../../src/providers/apple/apple-local-engine.js';

describe('Vision Methods', () => {
  const adapter = new AppleRuntimeAdapter();

  it('OCR returns extracted text with confidence', async () => {
    const result = await adapter.execute('apple.vision.ocr', {
      imageData: 'base64image...',
    });
    const output = result.output as { extractedText: string; confidence: number; regions: unknown[] };
    expect(output.extractedText).toBeDefined();
    expect(typeof output.extractedText).toBe('string');
    expect(output.confidence).toBeGreaterThan(0);
    expect(output.regions).toBeInstanceOf(Array);
    expect(output.regions.length).toBeGreaterThan(0);
  });

  it('document_extract returns page data', async () => {
    const result = await adapter.execute('apple.vision.document_extract', {
      imageData: 'base64doc...',
    });
    const output = result.output as { pages: Array<{ pageNumber: number; text: string }> };
    expect(output.pages).toBeInstanceOf(Array);
    expect(output.pages[0].pageNumber).toBe(1);
    expect(output.pages[0].text).toBeDefined();
  });

  it('performOCR directly returns extracted text with image fingerprint', () => {
    const result = performOCR({ imageData: 'test-image-bytes' });
    expect(result.extractedText).toMatch(/^Extracted text from image [a-f0-9]+\.$/);
    expect(result.confidence).toBe(0.94);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].bounds).toEqual({ x: 10, y: 10, width: 220, height: 32 });
  });

  it('extractDocument directly delegates to OCR and wraps in page structure', () => {
    const result = extractDocument({ imageData: 'doc-image-data' });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].text).toMatch(/^Extracted text from image/);
    expect(result.pages[0].tables).toEqual([]);
  });
});
