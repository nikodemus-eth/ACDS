/**
 * Translation method handler.
 *
 * Dispatches apple.translation.translate to the AppleTranslationPlatform.
 */
import type { AppleTranslationPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleTranslation(
  method_id: string,
  input: unknown,
  platform: AppleTranslationPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.translation.translate": {
      const text = data?.text;
      const targetLang = data?.target_language;
      if (typeof text !== "string" || typeof targetLang !== "string") {
        throw new ValidationFailedError(
          "apple.translation.translate requires 'text' (string) and 'target_language' (string)",
        );
      }
      return platform.translate(text, targetLang);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
