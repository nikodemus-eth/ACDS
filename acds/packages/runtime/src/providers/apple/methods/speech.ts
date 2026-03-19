/**
 * Speech method handler.
 *
 * Dispatches apple.speech_in.transcribe_live, .transcribe_file,
 * .transcribe_longform, .dictation_fallback to the AppleSpeechPlatform.
 */
import type { AppleSpeechPlatform } from "../apple-interfaces.js";
import { MethodNotAvailableError, ValidationFailedError } from "../../../domain/errors.js";

export async function handleSpeech(
  method_id: string,
  input: unknown,
  platform: AppleSpeechPlatform,
): Promise<unknown> {
  const data = input as Record<string, unknown>;

  switch (method_id) {
    case "apple.speech_in.transcribe_live": {
      const audioStream = data?.audio_stream;
      if (audioStream === undefined || audioStream === null) {
        throw new ValidationFailedError("apple.speech_in.transcribe_live requires 'audio_stream'");
      }
      return platform.transcribeLive(audioStream);
    }
    case "apple.speech_in.transcribe_file": {
      const path = data?.path;
      if (typeof path !== "string") {
        throw new ValidationFailedError("apple.speech_in.transcribe_file requires a string 'path'");
      }
      return platform.transcribeFile(path);
    }
    case "apple.speech_in.transcribe_longform": {
      const path = data?.path;
      if (typeof path !== "string") {
        throw new ValidationFailedError("apple.speech_in.transcribe_longform requires a string 'path'");
      }
      return platform.transcribeLongform(path);
    }
    case "apple.speech_in.dictation_fallback": {
      const audioStream = data?.audio_stream;
      if (audioStream === undefined || audioStream === null) {
        throw new ValidationFailedError("apple.speech_in.dictation_fallback requires 'audio_stream'");
      }
      return platform.dictationFallback(audioStream);
    }
    default:
      throw new MethodNotAvailableError(method_id);
  }
}
