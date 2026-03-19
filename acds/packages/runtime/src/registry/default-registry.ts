/**
 * Pre-built registry with Apple Intelligence and Ollama providers
 * and all 18 Apple methods.
 */
import { Registry } from "./registry.js";
import { PolicyTier } from "../domain/policy-tiers.js";
import type { MethodDefinition } from "../domain/method-registry.js";
import type { ProviderRegistrationInput } from "./registry-types.js";

// ---------------------------------------------------------------------------
// Provider registrations
// ---------------------------------------------------------------------------
const APPLE_PROVIDER: ProviderRegistrationInput = {
  source_class: "provider",
  provider_id: "apple-intelligence-runtime",
  display_name: "Apple Intelligence Runtime",
  provider_class: "sovereign_runtime",
  execution_mode: "local",
  deterministic: true,
  health_status: "healthy",
  subsystems: ["text", "writing", "speech_in", "speech_out", "vision", "image", "translation", "sound"],
};

const OLLAMA_PROVIDER: ProviderRegistrationInput = {
  source_class: "provider",
  provider_id: "ollama-local",
  display_name: "Ollama Local Runtime",
  provider_class: "local_runtime",
  execution_mode: "local",
  deterministic: true,
  health_status: "healthy",
  subsystems: ["text"],
};

// ---------------------------------------------------------------------------
// Apple method definitions (18 methods)
// ---------------------------------------------------------------------------
function appleMethod(
  name: string,
  subsystem: string,
  tier: PolicyTier,
  overrides?: Partial<MethodDefinition>,
): MethodDefinition {
  return {
    method_id: `apple.${subsystem}.${name}`,
    provider_id: "apple-intelligence-runtime",
    subsystem,
    deterministic: true,
    requires_network: false,
    policy_tier: tier,
    input_schema: {},
    output_schema: {},
    ...overrides,
  };
}

const APPLE_METHODS: readonly MethodDefinition[] = [
  // Text (Tier A): generate, summarize, extract
  appleMethod("generate", "text", PolicyTier.A),
  appleMethod("summarize", "text", PolicyTier.A),
  appleMethod("extract", "text", PolicyTier.A),

  // Writing (Tier B): rewrite, proofread, summarize
  appleMethod("rewrite", "writing", PolicyTier.B),
  appleMethod("proofread", "writing", PolicyTier.B),
  appleMethod("summarize", "writing", PolicyTier.B),

  // Speech In (Tier A): transcribe_live, transcribe_file, transcribe_longform, dictation_fallback
  appleMethod("transcribe_live", "speech_in", PolicyTier.A),
  appleMethod("transcribe_file", "speech_in", PolicyTier.A),
  appleMethod("transcribe_longform", "speech_in", PolicyTier.A),
  appleMethod("dictation_fallback", "speech_in", PolicyTier.A),

  // Speech Out (Tier A): speak, render_audio
  appleMethod("speak", "speech_out", PolicyTier.A),
  appleMethod("render_audio", "speech_out", PolicyTier.A),

  // Vision (Tier A): ocr, document_extract
  appleMethod("ocr", "vision", PolicyTier.A),
  appleMethod("document_extract", "vision", PolicyTier.A),

  // Image (Tier C): generate
  appleMethod("generate", "image", PolicyTier.C),

  // Translation (Tier A): translate
  appleMethod("translate", "translation", PolicyTier.A),

  // Sound (Tier A): classify
  appleMethod("classify", "sound", PolicyTier.A),
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createDefaultRegistry(): Registry {
  const registry = new Registry();

  registry.registerProvider(APPLE_PROVIDER);
  registry.registerProvider(OLLAMA_PROVIDER);

  for (const method of APPLE_METHODS) {
    registry.registerMethod(method);
  }

  return registry;
}

/** Exported for tests that need to inspect the raw definitions. */
export { APPLE_METHODS, APPLE_PROVIDER, OLLAMA_PROVIDER };
