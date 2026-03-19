/**
 * Apple method registry — maps all 18 Apple method_ids to their handler functions.
 */
import type { ApplePlatformBundle } from "./apple-interfaces.js";
import { handleFoundationModels } from "./methods/foundation-models.js";
import { handleWritingTools } from "./methods/writing-tools.js";
import { handleSpeech } from "./methods/speech.js";
import { handleTts } from "./methods/tts.js";
import { handleVision } from "./methods/vision.js";
import { handleImage } from "./methods/image.js";
import { handleTranslation } from "./methods/translation.js";
import { handleSound } from "./methods/sound.js";

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------
export type AppleMethodHandler = (
  method_id: string,
  input: unknown,
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Registry builder
// ---------------------------------------------------------------------------
export function buildAppleMethodHandlers(
  bundle: ApplePlatformBundle,
): Map<string, AppleMethodHandler> {
  const handlers = new Map<string, AppleMethodHandler>();

  // Foundation Models (text subsystem)
  const fmHandler: AppleMethodHandler = (id, input) =>
    handleFoundationModels(id, input, bundle.foundationModels);
  handlers.set("apple.text.generate", fmHandler);
  handlers.set("apple.text.summarize", fmHandler);
  handlers.set("apple.text.extract", fmHandler);

  // Writing Tools
  const wtHandler: AppleMethodHandler = (id, input) =>
    handleWritingTools(id, input, bundle.writingTools);
  handlers.set("apple.writing.rewrite", wtHandler);
  handlers.set("apple.writing.proofread", wtHandler);
  handlers.set("apple.writing.summarize", wtHandler);

  // Speech In
  const speechHandler: AppleMethodHandler = (id, input) =>
    handleSpeech(id, input, bundle.speech);
  handlers.set("apple.speech_in.transcribe_live", speechHandler);
  handlers.set("apple.speech_in.transcribe_file", speechHandler);
  handlers.set("apple.speech_in.transcribe_longform", speechHandler);
  handlers.set("apple.speech_in.dictation_fallback", speechHandler);

  // Speech Out (TTS)
  const ttsHandler: AppleMethodHandler = (id, input) =>
    handleTts(id, input, bundle.tts);
  handlers.set("apple.speech_out.speak", ttsHandler);
  handlers.set("apple.speech_out.render_audio", ttsHandler);

  // Vision
  const visionHandler: AppleMethodHandler = (id, input) =>
    handleVision(id, input, bundle.vision);
  handlers.set("apple.vision.ocr", visionHandler);
  handlers.set("apple.vision.document_extract", visionHandler);

  // Image
  const imageHandler: AppleMethodHandler = (id, input) =>
    handleImage(id, input, bundle.image);
  handlers.set("apple.image.generate", imageHandler);

  // Translation
  const translationHandler: AppleMethodHandler = (id, input) =>
    handleTranslation(id, input, bundle.translation);
  handlers.set("apple.translation.translate", translationHandler);

  // Sound
  const soundHandler: AppleMethodHandler = (id, input) =>
    handleSound(id, input, bundle.sound);
  handlers.set("apple.sound.classify", soundHandler);

  return handlers;
}
