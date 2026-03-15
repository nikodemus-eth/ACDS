import type { AdapterRequest } from './AdapterTypes.js';

export function normalizeRequest(request: Partial<AdapterRequest> & { prompt: string; model: string }): AdapterRequest {
  return {
    prompt: request.prompt,
    model: request.model,
    systemPrompt: request.systemPrompt,
    temperature: request.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? 2048,
    topP: request.topP,
    stopSequences: request.stopSequences,
    responseFormat: request.responseFormat ?? 'text',
  };
}
