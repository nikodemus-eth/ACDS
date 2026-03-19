/**
 * Sound method handler.
 *
 * Dispatches apple.sound.classify to the AppleSoundPlatform.
 */
import type { AppleSoundPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleSound(
  method_id: string,
  input: unknown,
  platform: AppleSoundPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.sound.classify": {
      const audioPath = data?.audio_path;
      if (typeof audioPath !== "string") {
        throw new ValidationFailedError("apple.sound.classify requires a string 'audio_path'");
      }
      return platform.classify(audioPath);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
