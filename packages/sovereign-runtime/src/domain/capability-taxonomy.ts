import { z } from 'zod';
import type { CapabilityContract } from './capability-contract.js';

/**
 * Canonical capability IDs for the ACDS capability fabric.
 * Frozen — never mutate at runtime.
 */
export const CAPABILITY_IDS = {
  TEXT_GENERATE: 'text.generate',
  TEXT_SUMMARIZE: 'text.summarize',
  TEXT_CLASSIFY: 'text.classify',
  TEXT_EMBED: 'text.embed',
  TEXT_EXTRACT: 'text.extract',
  TEXT_REWRITE: 'text.rewrite',
  TEXT_PROOFREAD: 'text.proofread',
  SPEECH_TRANSCRIBE: 'speech.transcribe',
  SPEECH_SYNTHESIZE: 'speech.synthesize',
  IMAGE_GENERATE: 'image.generate',
  IMAGE_DESCRIBE: 'image.describe',
  IMAGE_OCR: 'image.ocr',
  SOUND_CLASSIFY: 'sound.classify',
  TRANSLATION_TRANSLATE: 'translation.translate',
  AGENT_CONTROL_DECIDE: 'agent.control.decide',
  ROUTER_SCORE: 'router.score',
  POLICY_EVALUATE: 'policy.evaluate',
  RISK_ASSESS: 'risk.assess',
} as const;

Object.freeze(CAPABILITY_IDS);

export type CapabilityId = (typeof CAPABILITY_IDS)[keyof typeof CAPABILITY_IDS];

/**
 * All canonical capability contracts with Zod schemas.
 */
export const CAPABILITY_CONTRACTS: CapabilityContract[] = [
  // ── Text capabilities ──
  {
    id: CAPABILITY_IDS.TEXT_GENERATE,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ prompt: z.string(), maxTokens: z.number().optional() }),
    outputSchema: z.object({ text: z.string(), tokenCount: z.number() }),
    deterministic: false,
    description: 'Generate text from a prompt',
  },
  {
    id: CAPABILITY_IDS.TEXT_SUMMARIZE,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ summary: z.string(), tokenCount: z.number() }),
    deterministic: true,
    description: 'Summarize a text passage',
  },
  {
    id: CAPABILITY_IDS.TEXT_CLASSIFY,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string(), labels: z.array(z.string()).optional() }),
    outputSchema: z.object({ label: z.string(), confidence: z.number() }),
    deterministic: true,
    description: 'Classify text into categories',
  },
  {
    id: CAPABILITY_IDS.TEXT_EMBED,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ embedding: z.array(z.number()), dimensions: z.number() }),
    deterministic: true,
    description: 'Generate vector embedding for text',
  },
  {
    id: CAPABILITY_IDS.TEXT_EXTRACT,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({
      entities: z.array(z.object({ type: z.string(), value: z.string(), confidence: z.number() })),
    }),
    deterministic: true,
    description: 'Extract structured entities from text',
  },
  {
    id: CAPABILITY_IDS.TEXT_REWRITE,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string(), style: z.string().optional() }),
    outputSchema: z.object({ rewrittenText: z.string() }),
    deterministic: true,
    description: 'Rewrite text with optional style guidance',
  },
  {
    id: CAPABILITY_IDS.TEXT_PROOFREAD,
    version: '1.0',
    category: 'text',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({
      correctedText: z.string(),
      corrections: z.array(z.object({ original: z.string(), corrected: z.string(), position: z.number() })),
    }),
    deterministic: true,
    description: 'Proofread and correct text',
  },

  // ── Speech capabilities ──
  {
    id: CAPABILITY_IDS.SPEECH_TRANSCRIBE,
    version: '1.0',
    category: 'speech',
    inputSchema: z.object({ audioData: z.string(), language: z.string().optional() }),
    outputSchema: z.object({ transcript: z.string(), confidence: z.number(), language: z.string() }),
    deterministic: false,
    description: 'Transcribe audio to text',
  },
  {
    id: CAPABILITY_IDS.SPEECH_SYNTHESIZE,
    version: '1.0',
    category: 'speech',
    inputSchema: z.object({ text: z.string(), voice: z.string().optional() }),
    outputSchema: z.object({ artifactRef: z.string(), format: z.string(), durationMs: z.number() }),
    deterministic: true,
    description: 'Synthesize speech from text',
  },

  // ── Image capabilities ──
  {
    id: CAPABILITY_IDS.IMAGE_GENERATE,
    version: '1.0',
    category: 'image',
    inputSchema: z.object({ prompt: z.string(), style: z.string().optional() }),
    outputSchema: z.object({ artifactRef: z.string(), format: z.string(), width: z.number(), height: z.number() }),
    deterministic: false,
    description: 'Generate an image from a prompt',
  },
  {
    id: CAPABILITY_IDS.IMAGE_DESCRIBE,
    version: '1.0',
    category: 'image',
    inputSchema: z.object({ imageData: z.string() }),
    outputSchema: z.object({ description: z.string(), tags: z.array(z.string()), confidence: z.number() }),
    deterministic: true,
    description: 'Describe the contents of an image',
  },
  {
    id: CAPABILITY_IDS.IMAGE_OCR,
    version: '1.0',
    category: 'image',
    inputSchema: z.object({ imageData: z.string() }),
    outputSchema: z.object({ extractedText: z.string(), confidence: z.number() }),
    deterministic: true,
    description: 'Extract text from an image via OCR',
  },

  // ── Sound capabilities ──
  {
    id: CAPABILITY_IDS.SOUND_CLASSIFY,
    version: '1.0',
    category: 'sound',
    inputSchema: z.object({ audioData: z.string() }),
    outputSchema: z.object({
      events: z.array(z.object({ label: z.string(), confidence: z.number() })),
    }),
    deterministic: true,
    description: 'Classify sounds in audio data',
  },

  // ── Translation capabilities ──
  {
    id: CAPABILITY_IDS.TRANSLATION_TRANSLATE,
    version: '1.0',
    category: 'translation',
    inputSchema: z.object({ text: z.string(), targetLanguage: z.string(), sourceLanguage: z.string().optional() }),
    outputSchema: z.object({ translatedText: z.string(), detectedLanguage: z.string(), targetLanguage: z.string() }),
    deterministic: true,
    description: 'Translate text between languages',
  },

  // ── Control / governance capabilities ──
  {
    id: CAPABILITY_IDS.AGENT_CONTROL_DECIDE,
    version: '1.0',
    category: 'control',
    inputSchema: z.object({ context: z.record(z.unknown()), options: z.array(z.string()) }),
    outputSchema: z.object({ decision: z.string(), confidence: z.number(), reasoning: z.string() }),
    deterministic: false,
    description: 'Agent-level decision making',
  },
  {
    id: CAPABILITY_IDS.ROUTER_SCORE,
    version: '1.0',
    category: 'control',
    inputSchema: z.object({ capabilityId: z.string(), candidates: z.array(z.string()) }),
    outputSchema: z.object({ scores: z.array(z.object({ candidateId: z.string(), score: z.number() })) }),
    deterministic: true,
    description: 'Score candidate providers for routing',
  },
  {
    id: CAPABILITY_IDS.POLICY_EVALUATE,
    version: '1.0',
    category: 'governance',
    inputSchema: z.object({ action: z.string(), context: z.record(z.unknown()) }),
    outputSchema: z.object({ allowed: z.boolean(), reason: z.string(), tier: z.string() }),
    deterministic: true,
    description: 'Evaluate a governance policy',
  },
  {
    id: CAPABILITY_IDS.RISK_ASSESS,
    version: '1.0',
    category: 'governance',
    inputSchema: z.object({ action: z.string(), context: z.record(z.unknown()) }),
    outputSchema: z.object({ riskLevel: z.enum(['low', 'medium', 'high', 'critical']), factors: z.array(z.string()) }),
    deterministic: true,
    description: 'Assess risk level for an action',
  },
];
