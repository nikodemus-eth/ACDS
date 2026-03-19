/**
 * Vision handler tests.
 */
import { describe, it, expect } from "vitest";
import { FakeVision } from "../../../src/providers/apple/apple-fakes.js";
import { handleVision } from "../../../src/providers/apple/methods/vision.js";

describe("Vision handler", () => {
  const platform = new FakeVision();

  it("OCR returns extracted text with confidence", async () => {
    const result = await handleVision(
      "apple.vision.ocr",
      { image_path: "/images/receipt.png" },
      platform,
    );
    const ocr = result as { text: string; confidence: number; regions: unknown[] };
    expect(ocr.text).toContain("OCR result from /images/receipt.png");
    expect(ocr.confidence).toBe(0.92);
    expect(ocr.regions.length).toBeGreaterThan(0);
  });

  it("document_extract returns structured result", async () => {
    const result = await handleVision(
      "apple.vision.document_extract",
      { image_path: "/docs/invoice.pdf" },
      platform,
    );
    const doc = result as { text: string; fields: Record<string, string>; confidence: number };
    expect(doc.text).toContain("Document text from /docs/invoice.pdf");
    expect(doc.fields).toHaveProperty("title");
    expect(doc.fields).toHaveProperty("date");
    expect(doc.confidence).toBeGreaterThan(0);
  });

  it("rejects missing image_path", async () => {
    await expect(
      handleVision("apple.vision.ocr", {}, platform),
    ).rejects.toThrow("requires a string 'image_path'");

    await expect(
      handleVision("apple.vision.document_extract", { image_path: 123 }, platform),
    ).rejects.toThrow("requires a string 'image_path'");
  });
});
