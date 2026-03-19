/**
 * Writing Tools method handler.
 *
 * Dispatches apple.writing.rewrite, apple.writing.proofread, apple.writing.summarize
 * to the AppleWritingToolsPlatform.
 */
import type { AppleWritingToolsPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleWritingTools(
  method_id: string,
  input: unknown,
  platform: AppleWritingToolsPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.writing.rewrite": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.writing.rewrite requires a string 'text'");
      }
      return platform.rewrite(text, data?.tone as string | undefined);
    }
    case "apple.writing.proofread": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.writing.proofread requires a string 'text'");
      }
      return platform.proofread(text);
    }
    case "apple.writing.summarize": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.writing.summarize requires a string 'text'");
      }
      return platform.summarize(text);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
