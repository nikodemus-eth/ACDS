import { SourceRegistry } from './registry.js';
import type { ProviderDefinition } from '../domain/source-types.js';
import { CapabilityRegistry } from './capability-registry.js';
import type { CapabilityBinding } from './capability-binding.js';
import { CAPABILITY_CONTRACTS, CAPABILITY_IDS } from '../domain/capability-taxonomy.js';
import { FREE_COST, LOCAL_LATENCY } from '../domain/cost-types.js';

/**
 * The canonical Apple sovereign runtime provider definition.
 */
export const APPLE_RUNTIME_PROVIDER: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple Intelligence Sovereign Runtime',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

/**
 * Creates a registry pre-populated with the Apple sovereign runtime.
 * Apple methods are registered separately (see apple-method-registry.ts)
 * to keep platform-specific registration decoupled.
 */
export function createDefaultRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.registerProvider(APPLE_RUNTIME_PROVIDER);
  return registry;
}

const APPLE_PROVIDER_ID = 'apple-intelligence-runtime';

/**
 * Apple method-to-capability bindings.
 * Each entry maps a specific Apple method to a canonical capability ID.
 */
const APPLE_CAPABILITY_BINDINGS: CapabilityBinding[] = [
  // Foundation Models
  { capabilityId: CAPABILITY_IDS.TEXT_GENERATE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.foundation_models.generate', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.foundation_models.summarize', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.TEXT_EXTRACT, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.foundation_models.extract', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },

  // Writing Tools
  { capabilityId: CAPABILITY_IDS.TEXT_REWRITE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.writing_tools.rewrite', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.TEXT_PROOFREAD, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.writing_tools.proofread', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.TEXT_SUMMARIZE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.writing_tools.summarize', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.90, locality: 'local' },

  // Speech
  { capabilityId: CAPABILITY_IDS.SPEECH_TRANSCRIBE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.speech.transcribe_file', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.SPEECH_TRANSCRIBE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.speech.transcribe_live', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.85, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.SPEECH_TRANSCRIBE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.speech.transcribe_longform', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.90, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.SPEECH_TRANSCRIBE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.speech.dictation_fallback', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.80, locality: 'local' },

  // TTS
  { capabilityId: CAPABILITY_IDS.SPEECH_SYNTHESIZE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.tts.speak', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.SPEECH_SYNTHESIZE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.tts.render_audio', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },

  // Vision
  { capabilityId: CAPABILITY_IDS.IMAGE_OCR, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.vision.ocr', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },
  { capabilityId: CAPABILITY_IDS.IMAGE_OCR, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.vision.document_extract', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.90, locality: 'local' },

  // Image Generation
  { capabilityId: CAPABILITY_IDS.IMAGE_GENERATE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.image_creator.generate', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.90, locality: 'local' },

  // Translation
  { capabilityId: CAPABILITY_IDS.TRANSLATION_TRANSLATE, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.translation.translate', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.95, locality: 'local' },

  // Sound
  { capabilityId: CAPABILITY_IDS.SOUND_CLASSIFY, capabilityVersion: '1.0', providerId: APPLE_PROVIDER_ID, methodId: 'apple.sound.classify', cost: FREE_COST, latency: LOCAL_LATENCY, reliability: 0.90, locality: 'local' },
];

/**
 * Creates a CapabilityRegistry pre-populated with all canonical contracts
 * and all Apple sovereign runtime bindings.
 */
export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();

  // Register all canonical contracts
  for (const contract of CAPABILITY_CONTRACTS) {
    registry.registerContract(contract);
  }

  // Bind all Apple methods
  for (const binding of APPLE_CAPABILITY_BINDINGS) {
    registry.bindProvider(binding);
  }

  return registry;
}
