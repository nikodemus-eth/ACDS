import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toOllamaRequest, fromOllamaResponse } from './OllamaMapper.js';
import type { OllamaGenerateResponse } from './OllamaMapper.js';

export class OllamaAdapter implements ProviderAdapter {
  readonly vendorName = 'ollama';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push('baseUrl is required');
    try { if (config.baseUrl) new URL(config.baseUrl); } catch { errors.push('baseUrl is not a valid URL'); }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return { success: false, latencyMs, message: `HTTP ${response.status}` };
      }
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      return { success: true, latencyMs, message: 'Connected', models };
    } catch (error) {
      return { success: false, latencyMs: Date.now() - start, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const ollamaRequest = toOllamaRequest(request);
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        throw new AdapterError({ message: `Ollama returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      }
      const data = await response.json() as OllamaGenerateResponse;
      return fromOllamaResponse(data, latencyMs);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      throw new AdapterError({
        message: isTimeout ? 'Ollama request timed out' : 'Ollama execution failed',
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        retryable: !isTimeout && !(error instanceof TypeError),
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
