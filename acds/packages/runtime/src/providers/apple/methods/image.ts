/**
 * Image method handler.
 *
 * Dispatches apple.image.generate to the AppleImagePlatform.
 */
import type { AppleImagePlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleImage(
  method_id: string,
  input: unknown,
  platform: AppleImagePlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.image.generate": {
      const prompt = data?.prompt;
      if (typeof prompt !== "string") {
        throw new ValidationFailedError("apple.image.generate requires a string 'prompt'");
      }
      return platform.generate(prompt, data?.style as string | undefined);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
