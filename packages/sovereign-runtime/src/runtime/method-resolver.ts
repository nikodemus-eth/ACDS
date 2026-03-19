import type { Intent } from './intent-resolver.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import type { SourceRegistry } from '../registry/registry.js';
import { MethodUnresolvedError } from '../domain/errors.js';

/**
 * Default intent-to-method mapping for the Apple sovereign runtime.
 * Each intent resolves to the canonical Apple method ID.
 */
const DEFAULT_METHOD_MAP: Record<string, string> = {
  summarization: 'apple.foundation_models.summarize',
  text_generation: 'apple.foundation_models.generate',
  text_extraction: 'apple.foundation_models.extract',
  text_rewrite: 'apple.writing_tools.rewrite',
  text_proofread: 'apple.writing_tools.proofread',
  transcription: 'apple.speech.transcribe_file',
  speech_output: 'apple.tts.render_audio',
  ocr: 'apple.vision.ocr',
  translation: 'apple.translation.translate',
  image_generation: 'apple.image_creator.generate',
  sound_classification: 'apple.sound.classify',
};

export interface MethodResolution {
  method: MethodDefinition;
  /** Whether this was resolved via explicit capability/session override. */
  isOverride: boolean;
}

/**
 * Resolves an intent to a concrete method definition.
 *
 * If useCapability is specified, the resolver returns a synthetic override
 * resolution — the capability path is handled separately by the policy engine.
 *
 * @throws MethodUnresolvedError if no method maps to the given intent.
 */
export function resolveMethod(
  intent: Intent,
  registry: SourceRegistry,
  options?: { useCapability?: string },
): MethodResolution {
  // If explicit capability override, signal the override path
  if (options?.useCapability) {
    const capabilitySource = registry.getSource(options.useCapability);
    if (capabilitySource && capabilitySource.sourceClass === 'capability') {
      // Return a synthetic resolution indicating capability override.
      // The actual execution is handled by the capability pipeline.
      return {
        method: {
          methodId: `capability.${options.useCapability}.${intent}`,
          providerId: options.useCapability,
          subsystem: 'foundation_models',
          policyTier: 'A' as any, // Policy engine will evaluate separately
          deterministic: false,
          requiresNetwork: true,
          inputSchema: {} as any,
          outputSchema: {} as any,
        },
        isOverride: true,
      };
    }
  }

  const methodId = DEFAULT_METHOD_MAP[intent];
  if (!methodId) {
    throw new MethodUnresolvedError(intent);
  }

  const method = registry.getMethod(methodId);
  if (!method) {
    throw new MethodUnresolvedError(intent);
  }

  return { method, isOverride: false };
}
