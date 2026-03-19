import type { AdapterRequest, AdapterResponse } from '../base/AdapterTypes.js';

export interface GeminiGenerateRequest {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    stopSequences?: string[];
    responseMimeType?: string;
  };
  systemInstruction?: { parts: Array<{ text: string }> };
}

export interface GeminiGenerateResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason: string;
  }>;
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
}

export function toGeminiRequest(request: AdapterRequest): GeminiGenerateRequest {
  const result: GeminiGenerateRequest = {
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      topP: request.topP,
      stopSequences: request.stopSequences,
      responseMimeType: request.responseFormat === 'json' ? 'application/json' : undefined,
    },
  };
  if (request.systemPrompt) {
    result.systemInstruction = { parts: [{ text: request.systemPrompt }] };
  }
  return result;
}

export function fromGeminiResponse(response: GeminiGenerateResponse, latencyMs: number, requestModel: string): AdapterResponse {
  const candidate = response.candidates?.[0];
  const text = candidate?.content.parts.map((p) => p.text).join('') ?? '';
  const fr = candidate?.finishReason;
  return {
    content: text,
    model: requestModel,
    inputTokens: response.usageMetadata?.promptTokenCount ?? null,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    finishReason: fr === 'STOP' ? 'stop' : fr === 'MAX_TOKENS' ? 'length' : 'unknown',
    latencyMs,
  };
}
