/**
 * Foundation Models method handler.
 *
 * Dispatches apple.text.generate, apple.text.summarize, apple.text.extract
 * to the AppleFoundationModelsPlatform.
 */
import type { AppleFoundationModelsPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export type FoundationModelsInput =
  | { prompt: string; options?: Record<string, unknown> }
  | { text: string }
  | { text: string; schema: Record<string, unknown> };

export async function handleFoundationModels(
  method_id: string,
  input: unknown,
  platform: AppleFoundationModelsPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.text.generate": {
      const prompt = data?.prompt;
      if (typeof prompt !== "string") {
        throw new ValidationFailedError("apple.text.generate requires a string 'prompt'");
      }
      return platform.generate(prompt, data?.options as any);
    }
    case "apple.text.summarize": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.text.summarize requires a string 'text'");
      }
      return platform.summarize(text);
    }
    case "apple.text.extract": {
      const text = data?.text;
      const schema = data?.schema;
      if (typeof text !== "string" || typeof schema !== "object" || schema === null) {
        throw new ValidationFailedError("apple.text.extract requires 'text' (string) and 'schema' (object)");
      }
      return platform.extract(text, schema as Record<string, unknown>);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
