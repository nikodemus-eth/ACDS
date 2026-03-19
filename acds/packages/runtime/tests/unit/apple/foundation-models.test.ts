/**
 * Foundation Models handler tests.
 */
import { describe, it, expect } from "vitest";
import { FakeFoundationModels } from "../../../src/providers/apple/apple-fakes.js";
import { handleFoundationModels } from "../../../src/providers/apple/methods/foundation-models.js";

describe("Foundation Models handler", () => {
  const platform = new FakeFoundationModels();

  it("generate returns text", async () => {
    const result = await handleFoundationModels(
      "apple.text.generate",
      { prompt: "Explain quantum computing" },
      platform,
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("Generated response for:");
    expect(result).toContain("Explain quantum computing");
  });

  it("summarize returns summary", async () => {
    const longText = "This is a detailed article about climate change and its impacts on global ecosystems including marine life, forests, and agricultural systems across multiple continents.";
    const result = await handleFoundationModels(
      "apple.text.summarize",
      { text: longText },
      platform,
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("Summary:");
  });

  it("extract returns structured data matching schema keys", async () => {
    const text = "John Smith is 42 years old and lives in San Francisco";
    const schema = { name: "string", age: "number", city: "string" };
    const result = await handleFoundationModels(
      "apple.text.extract",
      { text, schema },
      platform,
    );
    expect(result).toBeTypeOf("object");
    const data = result as Record<string, unknown>;
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("age");
    expect(data).toHaveProperty("city");
  });

  it("rejects missing prompt for generate", async () => {
    await expect(
      handleFoundationModels("apple.text.generate", {}, platform),
    ).rejects.toThrow("requires a string 'prompt'");
  });

  it("rejects missing text for summarize", async () => {
    await expect(
      handleFoundationModels("apple.text.summarize", { prompt: "wrong key" }, platform),
    ).rejects.toThrow("requires a string 'text'");
  });

  it("rejects missing schema for extract", async () => {
    await expect(
      handleFoundationModels("apple.text.extract", { text: "hello" }, platform),
    ).rejects.toThrow("requires 'text' (string) and 'schema' (object)");
  });
});
