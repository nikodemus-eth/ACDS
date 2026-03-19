/**
 * Intent Resolver — Pure function: task description -> structured intent.
 *
 * Performs keyword matching on the task string to determine the
 * caller's intent. Supports explicit capability/session overrides.
 */
import { MethodUnresolvedError } from "../domain/errors.js";
import type { SourceClass } from "../domain/source-types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface IntentResolutionInput {
  task: string;
  use_capability?: string;
  use_session?: string;
  risk_acknowledged?: boolean;
}

export interface SourceOverride {
  type: "capability" | "session";
  id: string;
  risk_acknowledged?: boolean;
}

export interface ResolvedIntent {
  intent: string;
  source_override?: SourceOverride;
}

// ---------------------------------------------------------------------------
// Keyword map — order matters: first match wins
// ---------------------------------------------------------------------------
const INTENT_KEYWORDS: readonly [string, readonly string[]][] = [
  ["summarization", ["summarize", "summarise", "summary", "summarization"]],
  ["transcription", ["transcribe", "transcription", "dictate", "dictation"]],
  ["speech_output", ["read aloud", "speak", "say aloud", "text to speech", "tts", "read this"]],
  ["ocr", ["ocr", "extract text from", "scan text", "read text from image", "screenshot"]],
  ["translation", ["translate", "translation"]],
  ["image_generation", ["generate an image", "create an image", "image generation", "draw"]],
  ["sound_classification", ["classify sound", "classify these sounds", "sound classification", "identify sound"]],
  ["text_generation", ["generate text", "text generation", "write me", "compose"]],
  ["proofreading", ["proofread", "proofreading", "check grammar", "grammar check"]],
  ["rewriting", ["rewrite", "rephrase", "paraphrase"]],
];

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------
export function resolveIntent(input: IntentResolutionInput): ResolvedIntent {
  const normalized = input.task.toLowerCase();

  let matched: string | undefined;

  for (const [intent, keywords] of INTENT_KEYWORDS) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        matched = intent;
        break;
      }
    }
    if (matched) break;
  }

  if (!matched) {
    throw new MethodUnresolvedError(input.task);
  }

  const result: ResolvedIntent = { intent: matched };

  // Explicit capability override
  if (input.use_capability) {
    result.source_override = {
      type: "capability",
      id: input.use_capability,
    };
  }

  // Explicit session override
  if (input.use_session) {
    result.source_override = {
      type: "session",
      id: input.use_session,
      risk_acknowledged: input.risk_acknowledged ?? false,
    };
  }

  return result;
}
