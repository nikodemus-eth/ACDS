import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toGeminiRequest, fromGeminiResponse } from './GeminiMapper.js';
import type { GeminiGenerateResponse } from './GeminiMapper.js';

export class GeminiAdapter implements ProviderAdapter {
  readonly vendorName = 'gemini';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push('baseUrl is required');
    if (!config.apiKey) errors.push('apiKey is required for Gemini');
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/v1beta/models?key=${config.apiKey}`, {
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) return { success: false, latencyMs, message: `HTTP ${response.status}` };
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      return { success: true, latencyMs, message: 'Connected', models };
    } catch (error) {
      return { success: false, latencyMs: Date.now() - start, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const geminiRequest = toGeminiRequest(request);
    const start = Date.now();
    const url = `${config.baseUrl}/v1beta/models/${request.model}:generateContent?key=${config.apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) throw new AdapterError({ message: `Gemini returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      const data = await response.json() as GeminiGenerateResponse;
      return fromGeminiResponse(data, latencyMs);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError({ message: 'Gemini execution failed', code: 'EXECUTION_FAILED', retryable: true, cause: error instanceof Error ? error : undefined });
    }
  }
}
