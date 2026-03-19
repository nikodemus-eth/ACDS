/**
 * TTS method handler.
 *
 * Dispatches apple.speech_out.speak, apple.speech_out.render_audio
 * to the AppleTtsPlatform.
 */
import type { AppleTtsPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleTts(
  method_id: string,
  input: unknown,
  platform: AppleTtsPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.speech_out.speak": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.speech_out.speak requires a string 'text'");
      }
      await platform.speak(text, data?.voice as string | undefined);
      return { spoken: true };
    }
    case "apple.speech_out.render_audio": {
      const text = data?.text;
      if (typeof text !== "string") {
        throw new ValidationFailedError("apple.speech_out.render_audio requires a string 'text'");
      }
      return platform.renderAudio(
        text,
        data?.voice as string | undefined,
        data?.format as string | undefined,
      );
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
