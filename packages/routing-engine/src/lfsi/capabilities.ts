// LFSI MVP — Capability Registry
// Spec reference: Section 5 (Capability Scope), Section 3 (Hard Scope Boundary)

import type { LfsiTier } from './types.js';

export interface LfsiCapability {
  readonly id: string;
  readonly tiers: readonly LfsiTier[];
  readonly appleMethod?: string;
  readonly ollamaModel?: string;
  readonly systemPrompt?: string;
  readonly responseFormat?: 'text' | 'json';
}

// Apple Tier 0 capabilities
// Ollama Tier 1 capabilities
// No image generation — explicitly excluded per spec section 6
const REGISTRY: ReadonlyMap<string, LfsiCapability> = new Map<string, LfsiCapability>([
  // --- Required Apple Tier 0 ---
  ['text.summarize', {
    id: 'text.summarize',
    tiers: ['tier0', 'tier1'],
    appleMethod: 'foundation_models.summarize',
    ollamaModel: 'qwen3:8b',
    systemPrompt: 'Summarize the following text concisely. Output only the summary.',
  }],
  ['text.rewrite', {
    id: 'text.rewrite',
    tiers: ['tier0', 'tier1'],
    appleMethod: 'writing_tools.rewrite',
    ollamaModel: 'qwen3:8b',
    systemPrompt: 'Rewrite the following text clearly and concisely. Output only the rewritten text.',
  }],
  ['text.extract.structured', {
    id: 'text.extract.structured',
    tiers: ['tier0', 'tier1'],
    appleMethod: 'foundation_models.generate',
    ollamaModel: 'qwen3:8b',
    systemPrompt: 'Extract structured data from the following text. Return valid JSON only.',
    responseFormat: 'json',
  }],
  ['speech.tts', {
    id: 'speech.tts',
    tiers: ['tier0'],
    appleMethod: 'tts.speak',
  }],
  ['speech.stt', {
    id: 'speech.stt',
    tiers: ['tier0'],
    appleMethod: 'speech.transcribe_file',
  }],

  // --- Optional Apple Tier 0 (available and cheap to include) ---
  ['intent.classify', {
    id: 'intent.classify',
    tiers: ['tier0'],
    appleMethod: 'foundation_models.generate',
    systemPrompt: 'Classify the intent of the following text. Return the category label only.',
  }],
  ['text.generate.short', {
    id: 'text.generate.short',
    tiers: ['tier0', 'tier1'],
    appleMethod: 'foundation_models.generate',
    ollamaModel: 'qwen3:8b',
  }],
  ['reasoning.light', {
    id: 'reasoning.light',
    tiers: ['tier0'],
    appleMethod: 'foundation_models.generate',
    systemPrompt: 'Think through the following step by step. Be concise.',
  }],

  // --- Required Ollama Tier 1 ---
  ['reasoning.deep', {
    id: 'reasoning.deep',
    tiers: ['tier1'],
    ollamaModel: 'qwen3:8b',
    systemPrompt: 'Think through the following problem step by step. Show your reasoning.',
  }],

  // --- Optional Ollama Tier 1 ---
  ['text.generate.long', {
    id: 'text.generate.long',
    tiers: ['tier1'],
    ollamaModel: 'qwen3:8b',
  }],
  ['code.assist.basic', {
    id: 'code.assist.basic',
    tiers: ['tier1'],
    ollamaModel: 'qwen3:8b',
    systemPrompt: 'You are a coding assistant. Help with the following task.',
  }],

  // --- Denied capabilities (exist in registry for policy checks) ---
  ['research.web', {
    id: 'research.web',
    tiers: ['tier2'],
  }],
]);

export function getCapability(id: string): LfsiCapability | undefined {
  return REGISTRY.get(id);
}

export function isKnownCapability(id: string): boolean {
  return REGISTRY.has(id);
}

export function getCapabilitiesForTier(tier: LfsiTier): LfsiCapability[] {
  return [...REGISTRY.values()].filter(c => c.tiers.includes(tier));
}

export function getAllCapabilityIds(): string[] {
  return [...REGISTRY.keys()];
}
