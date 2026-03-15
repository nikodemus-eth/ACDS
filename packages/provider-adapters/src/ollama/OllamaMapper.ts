import type { AdapterRequest, AdapterResponse } from '../base/AdapterTypes.js';

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    stop?: string[];
  };
  format?: string;
  stream: boolean;
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function toOllamaRequest(request: AdapterRequest): OllamaGenerateRequest {
  return {
    model: request.model,
    prompt: request.prompt,
    system: request.systemPrompt,
    options: {
      temperature: request.temperature,
      num_predict: request.maxTokens,
      top_p: request.topP,
      stop: request.stopSequences,
    },
    format: request.responseFormat === 'json' ? 'json' : undefined,
    stream: false,
  };
}

export function fromOllamaResponse(response: OllamaGenerateResponse, latencyMs: number): AdapterResponse {
  return {
    content: response.response,
    model: response.model,
    inputTokens: response.prompt_eval_count ?? null,
    outputTokens: response.eval_count ?? null,
    finishReason: response.done ? 'stop' : 'unknown',
    latencyMs,
  };
}
