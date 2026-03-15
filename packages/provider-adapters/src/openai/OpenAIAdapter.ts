import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toOpenAIRequest, fromOpenAIResponse } from './OpenAIMapper.js';
import type { OpenAIChatResponse } from './OpenAIMapper.js';

export class OpenAIAdapter implements ProviderAdapter {
  readonly vendorName = 'openai';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push('baseUrl is required');
    if (!config.apiKey) errors.push('apiKey is required for OpenAI');
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}`, ...config.additionalHeaders },
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) return { success: false, latencyMs, message: `HTTP ${response.status}` };
      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = data.data?.map((m) => m.id) ?? [];
      return { success: true, latencyMs, message: 'Connected', models };
    } catch (error) {
      return { success: false, latencyMs: Date.now() - start, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const openaiRequest = toOpenAIRequest(request);
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...config.additionalHeaders,
        },
        body: JSON.stringify(openaiRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) throw new AdapterError({ message: `OpenAI returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      const data = await response.json() as OpenAIChatResponse;
      return fromOpenAIResponse(data, latencyMs);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError({ message: 'OpenAI execution failed', code: 'EXECUTION_FAILED', retryable: true, cause: error instanceof Error ? error : undefined });
    }
  }
}
