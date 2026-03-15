import type { AdapterResponse } from './AdapterTypes.js';

export function normalizeResponse(partial: {
  content: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  finishReason?: string;
  latencyMs: number;
  rawMetadata?: Record<string, unknown>;
}): AdapterResponse {
  let finishReason: AdapterResponse['finishReason'];
  switch (partial.finishReason) {
    case 'stop':
    case 'length':
    case 'error':
      finishReason = partial.finishReason;
      break;
    default:
      finishReason = 'unknown';
  }

  return {
    content: partial.content,
    model: partial.model,
    inputTokens: partial.inputTokens ?? null,
    outputTokens: partial.outputTokens ?? null,
    finishReason,
    latencyMs: partial.latencyMs,
    rawMetadata: partial.rawMetadata,
  };
}
