import type { AdapterResponse } from '@acds/provider-adapters';

export interface NormalizedExecutionResult {
  content: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string;
  latencyMs: number;
}

export function normalizeExecutionResult(response: AdapterResponse): NormalizedExecutionResult {
  return {
    content: response.content,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    finishReason: response.finishReason,
    latencyMs: response.latencyMs,
  };
}
