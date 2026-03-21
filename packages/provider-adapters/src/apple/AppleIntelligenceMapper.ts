import type { AdapterRequest, AdapterResponse } from '../base/AdapterTypes.js';

export interface AppleBridgeRequest {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  /** Subsystem method to invoke (e.g. 'image_creator.generate', 'tts.speak'). Defaults to 'foundation_models.generate'. */
  method?: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  voice?: string;
  rate?: number;
}

export interface AppleBridgeResponse {
  model: string;
  content: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  capabilities?: string[];
}

export function toAppleBridgeRequest(request: AdapterRequest): AppleBridgeRequest {
  return {
    model: request.model,
    prompt: request.prompt,
    system: request.systemPrompt,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    responseFormat: request.responseFormat,
    method: request.method,
    targetLanguage: request.targetLanguage,
    sourceLanguage: request.sourceLanguage,
    voice: request.voice,
    rate: request.rate,
  };
}

export function fromAppleBridgeResponse(response: AppleBridgeResponse, latencyMs: number): AdapterResponse {
  return {
    content: response.content,
    model: response.model,
    inputTokens: response.inputTokens ?? null,
    outputTokens: response.outputTokens ?? null,
    finishReason: response.done ? 'stop' : 'unknown',
    latencyMs,
    rawMetadata: response.capabilities ? { capabilities: response.capabilities } : undefined,
  };
}
