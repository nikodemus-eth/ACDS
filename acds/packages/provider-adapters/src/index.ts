// Base adapter contract
export type { ProviderAdapter } from './base/ProviderAdapter.js';
export type {
  AdapterRequest,
  AdapterResponse,
  AdapterConnectionResult,
  AdapterConfig,
} from './base/AdapterTypes.js';
export { AdapterError } from './base/AdapterError.js';
export { normalizeRequest } from './base/normalizeRequest.js';
export { normalizeResponse } from './base/normalizeResponse.js';

// Ollama
export { OllamaAdapter } from './ollama/OllamaAdapter.js';
export type { OllamaConfig } from './ollama/OllamaConfig.js';

// LM Studio
export { LMStudioAdapter } from './lmstudio/LMStudioAdapter.js';
export type { LMStudioConfig } from './lmstudio/LMStudioConfig.js';

// Gemini
export { GeminiAdapter } from './gemini/GeminiAdapter.js';
export type { GeminiConfig } from './gemini/GeminiConfig.js';

// OpenAI
export { OpenAIAdapter } from './openai/OpenAIAdapter.js';
export type { OpenAIConfig } from './openai/OpenAIConfig.js';

// Apple Intelligence
export { AppleIntelligenceAdapter } from './apple/AppleIntelligenceAdapter.js';
export type { AppleIntelligenceConfig } from './apple/AppleIntelligenceConfig.js';
export { DEFAULT_APPLE_INTELLIGENCE_CONFIG } from './apple/AppleIntelligenceConfig.js';
