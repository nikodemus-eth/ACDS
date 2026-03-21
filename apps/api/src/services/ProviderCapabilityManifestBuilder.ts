// ---------------------------------------------------------------------------
// ProviderCapabilityManifestBuilder – maps provider vendors to capabilities
// ---------------------------------------------------------------------------

import { ProviderVendor } from '@acds/core-types';
import type { CapabilityManifestEntry, InputMode, OutputMode } from '@acds/core-types';
import type { Provider } from '@acds/core-types';
import { APPLE_METHODS } from '@acds/sovereign-runtime';

/** Subsystems the Apple Intelligence bridge currently implements. */
const SUPPORTED_APPLE_SUBSYSTEMS = new Set(['foundation_models', 'writing_tools']);

const SUBSYSTEM_TO_CATEGORY: Record<string, string> = {
  foundation_models: 'text',
  writing_tools: 'text',
  speech: 'speech',
  tts: 'speech',
  vision: 'image',
  image_creator: 'image',
  translation: 'translation',
  sound: 'sound',
};

const SUBSYSTEM_TO_INPUT_MODE: Record<string, InputMode> = {
  foundation_models: 'text_prompt',
  writing_tools: 'long_text',
  speech: 'audio_input',
  tts: 'tts_prompt',
  vision: 'image_upload',
  image_creator: 'image_prompt',
  translation: 'text_prompt',
  sound: 'audio_input',
};

const SUBSYSTEM_TO_OUTPUT_MODE: Record<string, OutputMode> = {
  foundation_models: 'text',
  writing_tools: 'text',
  speech: 'text',
  tts: 'audio',
  vision: 'json',
  image_creator: 'image',
  translation: 'text',
  sound: 'json',
};

function humanLabel(methodId: string): string {
  const parts = methodId.split('.');
  const action = parts[parts.length - 1]!;
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export class ProviderCapabilityManifestBuilder {
  buildManifest(provider: Provider): CapabilityManifestEntry[] {
    if (provider.vendor === ProviderVendor.APPLE) {
      return this.buildAppleManifest(provider);
    }
    return this.buildStandardManifest(provider);
  }

  private buildStandardManifest(provider: Provider): CapabilityManifestEntry[] {
    return [
      {
        capabilityId: 'text.generate',
        label: 'Text Generation',
        description: `Generate text using ${provider.name}`,
        category: 'text',
        inputMode: 'text_prompt',
        outputMode: 'text',
        available: provider.enabled,
      },
    ];
  }

  private buildAppleManifest(provider: Provider): CapabilityManifestEntry[] {
    return APPLE_METHODS.map((method) => ({
      capabilityId: method.methodId,
      label: humanLabel(method.methodId),
      description: `${method.subsystem} capability: ${method.methodId}`,
      category: SUBSYSTEM_TO_CATEGORY[method.subsystem] ?? 'text',
      inputMode: SUBSYSTEM_TO_INPUT_MODE[method.subsystem] ?? 'text_prompt',
      outputMode: SUBSYSTEM_TO_OUTPUT_MODE[method.subsystem] ?? 'text',
      available: provider.enabled && SUPPORTED_APPLE_SUBSYSTEMS.has(method.subsystem),
    }));
  }
}
