import { z } from 'zod';
import type { MethodDefinition } from '../../domain/method-registry.js';
import { PolicyTier } from '../../domain/policy-tiers.js';

const PROVIDER_ID = 'apple-intelligence-runtime';

/**
 * All Apple sovereign runtime methods with full metadata.
 * This is the canonical method registry for Apple on-device frameworks.
 */
export const APPLE_METHODS: MethodDefinition[] = [
  // ── Foundation Models (Tier A) ──
  {
    methodId: 'apple.foundation_models.generate',
    providerId: PROVIDER_ID,
    subsystem: 'foundation_models',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string(), maxTokens: z.number().optional(), temperature: z.number().optional() }),
    outputSchema: z.object({ generatedText: z.string(), tokenCount: z.number() }),
  },
  {
    methodId: 'apple.foundation_models.summarize',
    providerId: PROVIDER_ID,
    subsystem: 'foundation_models',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string(), maxTokens: z.number().optional() }),
    outputSchema: z.object({ summary: z.string(), tokenCount: z.number() }),
  },
  {
    methodId: 'apple.foundation_models.extract',
    providerId: PROVIDER_ID,
    subsystem: 'foundation_models',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ entities: z.array(z.object({ type: z.string(), value: z.string(), confidence: z.number() })) }),
  },

  // ── Writing Tools (Tier B) ──
  {
    methodId: 'apple.writing_tools.rewrite',
    providerId: PROVIDER_ID,
    subsystem: 'writing_tools',
    policyTier: PolicyTier.B,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ rewrittenText: z.string() }),
  },
  {
    methodId: 'apple.writing_tools.proofread',
    providerId: PROVIDER_ID,
    subsystem: 'writing_tools',
    policyTier: PolicyTier.B,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ correctedText: z.string(), corrections: z.array(z.any()) }),
  },
  {
    methodId: 'apple.writing_tools.summarize',
    providerId: PROVIDER_ID,
    subsystem: 'writing_tools',
    policyTier: PolicyTier.B,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ summary: z.string() }),
  },

  // ── Speech Input (Tier A) ──
  {
    methodId: 'apple.speech.transcribe_live',
    providerId: PROVIDER_ID,
    subsystem: 'speech',
    policyTier: PolicyTier.A,
    deterministic: false, // live input varies
    requiresNetwork: false,
    inputSchema: z.object({ sampleRate: z.number(), language: z.string().optional() }),
    outputSchema: z.object({ transcript: z.string(), segments: z.array(z.any()), language: z.string(), confidence: z.number() }),
  },
  {
    methodId: 'apple.speech.transcribe_file',
    providerId: PROVIDER_ID,
    subsystem: 'speech',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ audioData: z.string(), language: z.string().optional() }),
    outputSchema: z.object({ transcript: z.string(), segments: z.array(z.any()), language: z.string(), confidence: z.number() }),
  },
  {
    methodId: 'apple.speech.transcribe_longform',
    providerId: PROVIDER_ID,
    subsystem: 'speech',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ audioData: z.string(), language: z.string().optional() }),
    outputSchema: z.object({ transcript: z.string(), segments: z.array(z.any()), language: z.string(), confidence: z.number() }),
  },
  {
    methodId: 'apple.speech.dictation_fallback',
    providerId: PROVIDER_ID,
    subsystem: 'speech',
    policyTier: PolicyTier.A,
    deterministic: false,
    requiresNetwork: false,
    inputSchema: z.object({ audioData: z.string(), language: z.string().optional() }),
    outputSchema: z.object({ transcript: z.string(), segments: z.array(z.any()), language: z.string(), confidence: z.number() }),
  },

  // ── TTS (Tier A) ──
  {
    methodId: 'apple.tts.speak',
    providerId: PROVIDER_ID,
    subsystem: 'tts',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string(), voice: z.string().optional(), rate: z.number().optional() }),
    outputSchema: z.object({ status: z.string(), durationMs: z.number() }),
  },
  {
    methodId: 'apple.tts.render_audio',
    providerId: PROVIDER_ID,
    subsystem: 'tts',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string(), voice: z.string().optional(), rate: z.number().optional() }),
    outputSchema: z.object({ artifactRef: z.string(), format: z.string(), durationMs: z.number(), sizeBytes: z.number() }),
  },

  // ── Vision (Tier A) ──
  {
    methodId: 'apple.vision.ocr',
    providerId: PROVIDER_ID,
    subsystem: 'vision',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ imageData: z.string() }),
    outputSchema: z.object({ extractedText: z.string(), confidence: z.number(), regions: z.array(z.any()) }),
  },
  {
    methodId: 'apple.vision.document_extract',
    providerId: PROVIDER_ID,
    subsystem: 'vision',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ imageData: z.string() }),
    outputSchema: z.object({ pages: z.array(z.any()) }),
  },

  // ── Image Generation (Tier C) ──
  {
    methodId: 'apple.image_creator.generate',
    providerId: PROVIDER_ID,
    subsystem: 'image_creator',
    policyTier: PolicyTier.C,
    deterministic: false, // creative output varies
    requiresNetwork: false,
    inputSchema: z.object({ prompt: z.string(), style: z.string().optional() }),
    outputSchema: z.object({ artifactRef: z.string(), format: z.string(), width: z.number(), height: z.number() }),
  },

  // ── Translation (Tier A) ──
  {
    methodId: 'apple.translation.translate',
    providerId: PROVIDER_ID,
    subsystem: 'translation',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string(), targetLanguage: z.string(), sourceLanguage: z.string().optional() }),
    outputSchema: z.object({ translatedText: z.string(), detectedLanguage: z.string(), targetLanguage: z.string() }),
  },

  // ── Sound Analysis (Tier A) ──
  {
    methodId: 'apple.sound.classify',
    providerId: PROVIDER_ID,
    subsystem: 'sound',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ audioData: z.string() }),
    outputSchema: z.object({ events: z.array(z.object({ label: z.string(), confidence: z.number(), timeRange: z.any() })) }),
  },
];
