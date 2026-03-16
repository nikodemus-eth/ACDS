import type { AdapterRequest, AdapterResponse } from '../base/AdapterTypes.js';

export interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[] | null;
  response_format?: { type: string };
}

export interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export function toOpenAIRequest(request: AdapterRequest): OpenAIChatRequest {
  const messages: Array<{ role: string; content: string }> = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  messages.push({ role: 'user', content: request.prompt });
  return {
    model: request.model,
    messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    top_p: request.topP,
    stop: request.stopSequences ?? null,
    response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
  };
}

export function fromOpenAIResponse(response: OpenAIChatResponse, latencyMs: number): AdapterResponse {
  const choice = response.choices[0];
  return {
    content: choice?.message.content ?? '',
    model: response.model,
    inputTokens: response.usage?.prompt_tokens ?? null,
    outputTokens: response.usage?.completion_tokens ?? null,
    finishReason: (choice?.finish_reason === 'stop' ? 'stop' : choice?.finish_reason === 'length' ? 'length' : 'unknown') as AdapterResponse['finishReason'],
    latencyMs,
  };
}
