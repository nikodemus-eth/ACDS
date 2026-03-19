/**
 * Method Resolver — Pure function: resolved intent -> method_id + provider_id.
 *
 * Uses the Registry to find the default Apple method for each intent.
 * Handles capability overrides by routing to the capability path.
 */
import { MethodUnresolvedError } from "../domain/errors.js";
import type { SourceClass } from "../domain/source-types.js";
import type { ResolvedIntent } from "./intent-resolver.js";
import type { Registry } from "../registry/registry.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface ResolvedMethod {
  method_id: string;
  provider_id: string;
  source_class: SourceClass;
}

// ---------------------------------------------------------------------------
// Intent -> method_id mapping (Apple default methods)
// ---------------------------------------------------------------------------
const INTENT_METHOD_MAP: Record<string, string> = {
  summarization: "apple.text.summarize",
  transcription: "apple.speech_in.transcribe_file",
  speech_output: "apple.speech_out.render_audio",
  ocr: "apple.vision.ocr",
  translation: "apple.translation.translate",
  image_generation: "apple.image.generate",
  sound_classification: "apple.sound.classify",
  text_generation: "apple.text.generate",
  proofreading: "apple.writing.proofread",
  rewriting: "apple.writing.rewrite",
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------
export function resolveMethod(
  intent: ResolvedIntent,
  registry: Registry,
): ResolvedMethod {
  // Capability override: route to capability path
  if (intent.source_override?.type === "capability") {
    return {
      method_id: intent.source_override.id,
      provider_id: intent.source_override.id,
      source_class: "capability",
    };
  }

  // Session override: route to session path
  if (intent.source_override?.type === "session") {
    return {
      method_id: intent.source_override.id,
      provider_id: intent.source_override.id,
      source_class: "session",
    };
  }

  const methodId = INTENT_METHOD_MAP[intent.intent];
  if (!methodId) {
    throw new MethodUnresolvedError(intent.intent);
  }

  const method = registry.getMethod(methodId);
  if (!method) {
    throw new MethodUnresolvedError(methodId);
  }

  return {
    method_id: method.method_id,
    provider_id: method.provider_id,
    source_class: "provider",
  };
}
