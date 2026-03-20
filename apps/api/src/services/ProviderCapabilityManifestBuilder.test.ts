import { describe, it, expect } from 'vitest';
import { ProviderCapabilityManifestBuilder } from './ProviderCapabilityManifestBuilder.js';
import { ProviderVendor } from '@acds/core-types';
import type { Provider } from '@acds/core-types';

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'p1',
    name: 'Test Provider',
    vendor: ProviderVendor.OPENAI,
    authType: 'api_key' as any,
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'cloud',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProviderCapabilityManifestBuilder', () => {
  const builder = new ProviderCapabilityManifestBuilder();

  describe('buildManifest for standard providers', () => {
    it('returns a single text.generate capability for OpenAI', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.OPENAI }));
      expect(manifest).toHaveLength(1);
      expect(manifest[0].capabilityId).toBe('text.generate');
      expect(manifest[0].label).toBe('Text Generation');
      expect(manifest[0].category).toBe('text');
      expect(manifest[0].inputMode).toBe('text_prompt');
      expect(manifest[0].outputMode).toBe('text');
      expect(manifest[0].available).toBe(true);
    });

    it('returns text.generate for Ollama', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.OLLAMA }));
      expect(manifest).toHaveLength(1);
      expect(manifest[0].capabilityId).toBe('text.generate');
    });

    it('returns text.generate for LMStudio', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.LMSTUDIO }));
      expect(manifest).toHaveLength(1);
    });

    it('returns text.generate for Gemini', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.GEMINI }));
      expect(manifest).toHaveLength(1);
    });

    it('reflects provider enabled status in available field', () => {
      const manifest = builder.buildManifest(makeProvider({ enabled: false }));
      expect(manifest[0].available).toBe(false);
    });

    it('includes provider name in description', () => {
      const manifest = builder.buildManifest(makeProvider({ name: 'My Custom Provider' }));
      expect(manifest[0].description).toContain('My Custom Provider');
    });
  });

  describe('buildManifest for Apple vendor', () => {
    it('returns multiple Apple capabilities', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      expect(manifest.length).toBeGreaterThan(1);
    });

    it('all capabilities reference apple method IDs', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      for (const entry of manifest) {
        expect(entry.capabilityId).toContain('apple.');
      }
    });

    it('categorizes foundation_models as text', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const foundationEntry = manifest.find(e => e.capabilityId.includes('foundation_models'));
      expect(foundationEntry).toBeDefined();
      expect(foundationEntry!.category).toBe('text');
      expect(foundationEntry!.inputMode).toBe('text_prompt');
      expect(foundationEntry!.outputMode).toBe('text');
    });

    it('categorizes speech as speech', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const speechEntry = manifest.find(e => e.capabilityId.includes('speech'));
      if (speechEntry) {
        expect(speechEntry.category).toBe('speech');
        expect(speechEntry.inputMode).toBe('audio_input');
        expect(speechEntry.outputMode).toBe('text');
      }
    });

    it('categorizes tts as speech category', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const ttsEntry = manifest.find(e => e.capabilityId.includes('tts'));
      if (ttsEntry) {
        expect(ttsEntry.category).toBe('speech');
        expect(ttsEntry.inputMode).toBe('tts_prompt');
        expect(ttsEntry.outputMode).toBe('audio');
      }
    });

    it('categorizes vision as image', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const visionEntry = manifest.find(e => e.capabilityId.includes('vision'));
      if (visionEntry) {
        expect(visionEntry.category).toBe('image');
        expect(visionEntry.outputMode).toBe('json');
      }
    });

    it('categorizes translation correctly', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const translationEntry = manifest.find(e => e.capabilityId.includes('translation'));
      if (translationEntry) {
        expect(translationEntry.category).toBe('translation');
        expect(translationEntry.outputMode).toBe('text');
      }
    });

    it('categorizes sound correctly', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const soundEntry = manifest.find(e => e.capabilityId.includes('sound'));
      if (soundEntry) {
        expect(soundEntry.category).toBe('sound');
        expect(soundEntry.outputMode).toBe('json');
      }
    });

    it('sets available based on provider enabled status', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE, enabled: false }));
      for (const entry of manifest) {
        expect(entry.available).toBe(false);
      }
    });

    it('generates human-readable labels from method IDs', () => {
      const manifest = builder.buildManifest(makeProvider({ vendor: ProviderVendor.APPLE }));
      const generateEntry = manifest.find(e => e.capabilityId === 'apple.foundation_models.generate');
      if (generateEntry) {
        expect(generateEntry.label).toBe('Generate');
      }
    });
  });
});
